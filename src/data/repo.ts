import { dailyId, hourlyId, intervalToAggregates, sessionsToAggregates } from '../core/aggregate';
import { parseSite } from '../core/domain';
import type { Categorizer } from '../core/eligibility';
import { categorize, type DomainRule } from '../core/rules';
import type { Segment, SessionSink } from '../core/types';
import { db as defaultDb, META_SESSIONS_FROM, type SessionRow, type SundialDB } from './db';
import { DEFAULT_DICTIONARY } from './defaults/dictionary';

export function createRepo(db: SundialDB = defaultDb) {
  /** Add one interval's time to the daily and hourly aggregates. Call inside a rw transaction. */
  async function addToAggregates(meta: Pick<SessionRow, 'key' | 'domain' | 'categoryId'>, fromTs: number, toTs: number) {
    const { daily, hourly } = intervalToAggregates(meta, fromTs, toTs);
    for (const d of daily) {
      const cur = await db.dailyAggregates.get([...dailyId(d)]);
      await db.dailyAggregates.put({ ...d, totalMs: (cur?.totalMs ?? 0) + d.totalMs });
    }
    for (const h of hourly) {
      const cur = await db.hourlyAggregates.get([...hourlyId(h)]);
      await db.hourlyAggregates.put({ ...h, totalMs: (cur?.totalMs ?? 0) + h.totalMs });
    }
  }

  /**
   * Tracker sink. Extends (or creates) the session row and adds the delta to the
   * aggregates atomically. Idempotent: a segment already covered by the row's
   * endTs (e.g. retried after a worker crash) is not counted twice.
   */
  async function writeSegment(seg: Segment): Promise<number> {
    return db.transaction('rw', [db.sessions, db.dailyAggregates, db.hourlyAggregates], async () => {
      const s = seg.session;
      let fromTs = seg.fromTs;
      let rowId = seg.rowId;
      const existing = rowId !== undefined ? await db.sessions.get(rowId) : undefined;

      if (existing) {
        fromTs = Math.max(fromTs, existing.endTs);
        if (fromTs >= seg.toTs) return existing.id!;
        await db.sessions.update(existing.id!, { endTs: seg.toTs, durationMs: seg.toTs - existing.startTs });
      } else {
        // New row, or the old one was deleted underneath us (retention / delete-all).
        rowId = await db.sessions.add({
          date: seg.date,
          domain: s.domain,
          host: s.host,
          key: s.key,
          startTs: fromTs,
          endTs: seg.toTs,
          durationMs: seg.toTs - fromTs,
          categoryId: s.categoryId,
          ruleSource: s.ruleSource,
        });
      }
      await addToAggregates(s, fromTs, seg.toTs);
      return rowId!;
    });
  }

  const sink: SessionSink = { writeSegment };

  async function sessionsCoverFrom(): Promise<string> {
    return ((await db.meta.get(META_SESSIONS_FROM))?.value as string | undefined) ?? '0000-00-00';
  }

  /**
   * Recompute aggregates for the given dates from raw sessions. Dates older than
   * the session coverage window are skipped (their sessions no longer exist).
   */
  async function rebuildAggregates(dates: Iterable<string>): Promise<void> {
    const from = await sessionsCoverFrom();
    const list = [...new Set(dates)].filter((d) => d >= from);
    if (!list.length) return;
    await db.transaction('rw', [db.sessions, db.dailyAggregates, db.hourlyAggregates], async () => {
      await db.dailyAggregates.where('date').anyOf(list).delete();
      await db.hourlyAggregates.where('date').anyOf(list).delete();
      const sessions = await db.sessions.where('date').anyOf(list).toArray();
      const { daily, hourly } = sessionsToAggregates(sessions);
      await db.dailyAggregates.bulkPut(daily);
      await db.hourlyAggregates.bulkPut(hourly);
    });
  }

  async function loadRules(): Promise<{ rules: DomainRule[]; known: Set<string> }> {
    const [rules, cats] = await Promise.all([db.domainRules.toArray(), db.categories.toCollection().primaryKeys()]);
    return { rules, known: new Set(cats) };
  }

  /** Categorizer for the tracker, reflecting the current rules. */
  async function getCategorizer(): Promise<Categorizer> {
    const { rules, known } = await loadRules();
    return (input) => categorize(input, rules, DEFAULT_DICTIONARY, known);
  }

  /** Category for a site from rules that don't need a title/path (used for history). */
  function siteCategory(key: string, domain: string, rules: DomainRule[], known: Set<string>) {
    const site = parseSite(`https://${key}/`);
    return categorize({ host: site?.host ?? key, domain, path: '', title: '' }, rules, DEFAULT_DICTIONARY, known);
  }

  /**
   * Re-apply current rules to stored history. Sessions logged under a keyword
   * rule keep their category (their titles were never stored). Within the
   * session window aggregates are rebuilt; older aggregates are relabelled by key.
   */
  async function applyRulesToHistory(keys?: string[]): Promise<void> {
    const { rules, known } = await loadRules();
    const from = await sessionsCoverFrom();
    const touchedDates = new Set<string>();

    await db.transaction('rw', [db.sessions, db.dailyAggregates, db.hourlyAggregates], async () => {
      const sessions = keys ? db.sessions.where('key').anyOf(keys) : db.sessions.toCollection();
      await sessions.modify((row) => {
        if (row.ruleSource === 'keyword') return;
        const next = siteCategory(row.host, row.domain, rules, known);
        if (next.ruleSource === 'keyword') return;
        if (next.categoryId !== row.categoryId || next.ruleSource !== row.ruleSource) {
          row.categoryId = next.categoryId;
          row.ruleSource = next.ruleSource;
          touchedDates.add(row.date);
        }
      });

      // Pre-window aggregates: relabel by key, merging rows that collide.
      const old = keys
        ? await db.dailyAggregates.where('key').anyOf(keys).filter((a) => a.date < from).toArray()
        : await db.dailyAggregates.where('date').below(from).toArray();
      const oldHourly = keys
        ? await db.hourlyAggregates.where('key').anyOf(keys).filter((a) => a.date < from).toArray()
        : await db.hourlyAggregates.where('date').below(from).toArray();
      const relabel = <T extends { key: string; categoryId: string; totalMs: number }>(
        rows: T[],
        domainOf: (r: T) => string,
        id: (r: T) => readonly unknown[],
      ) => {
        const merged = new Map<string, T>();
        const removed: T[] = [];
        for (const r of rows) {
          const categoryId = siteCategory(r.key, domainOf(r), rules, known).categoryId;
          if (categoryId !== r.categoryId) removed.push(r);
          const next = { ...r, categoryId };
          const k = id(next).join('|');
          const cur = merged.get(k);
          if (cur) cur.totalMs += next.totalMs;
          else merged.set(k, next);
        }
        return { removed, merged: [...merged.values()] };
      };
      const d = relabel(old, (r) => r.domain, (r) => dailyId(r));
      const domainByKey = new Map(old.map((r) => [r.key, r.domain]));
      const h = relabel(oldHourly, (r) => domainByKey.get(r.key) ?? r.key, (r) => hourlyId(r));
      await db.dailyAggregates.bulkDelete(d.removed.map((r) => [...dailyId(r)] as [string, string, string]));
      await db.dailyAggregates.bulkPut(d.merged);
      await db.hourlyAggregates.bulkDelete(h.removed.map((r) => [...hourlyId(r)] as [string, number, string, string]));
      await db.hourlyAggregates.bulkPut(h.merged);
    });

    await rebuildAggregates(touchedDates);
  }

  /**
   * Assign a site (tracking key) to a category via an exact host or domain rule,
   * replacing any existing rule for it. Optionally re-categorize history.
   */
  async function setSiteCategory(key: string, categoryId: string, opts: { applyToHistory: boolean }): Promise<void> {
    const site = parseSite(`https://${key}/`);
    const type = site && site.host !== site.domain ? 'host' : 'domain';
    await db.transaction('rw', db.domainRules, async () => {
      await db.domainRules.where('matchDomain').equals(key).filter((r) => r.type === type).delete();
      await db.domainRules.add({ type, matchDomain: key, categoryId, priority: 0, enabled: true });
    });
    if (opts.applyToHistory) await applyRulesToHistory([key]);
  }

  /** Daily aggregates for an inclusive local-date range. */
  function dailyRange(from: string, to: string) {
    return db.dailyAggregates.where('date').between(from, to, true, true).toArray();
  }

  function hourlyRange(from: string, to: string) {
    return db.hourlyAggregates.where('date').between(from, to, true, true).toArray();
  }

  function sessionsRange(from: string, to: string) {
    return db.sessions.where('date').between(from, to, true, true).sortBy('startTs');
  }

  return {
    db,
    sink,
    writeSegment,
    rebuildAggregates,
    getCategorizer,
    applyRulesToHistory,
    setSiteCategory,
    dailyRange,
    hourlyRange,
    sessionsRange,
    sessionsCoverFrom,
  };
}

export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo();
