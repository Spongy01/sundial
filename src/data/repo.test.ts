import { beforeEach, describe, expect, it } from 'vitest';
import { sessionsToAggregates } from '../core/aggregate';
import type { OpenSession } from '../core/types';
import { META_SESSIONS_FROM, SundialDB } from './db';
import { createRepo, type Repo } from './repo';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

let repo: Repo;
let n = 0;

beforeEach(async () => {
  repo = createRepo(new SundialDB(`test-${n++}`));
  await repo.db.open();
  await repo.db.meta.put({ key: META_SESSIONS_FROM, value: '2026-01-01' });
});

const session = (over: Partial<OpenSession> = {}): OpenSession => ({
  key: 'youtube.com',
  domain: 'youtube.com',
  host: 'youtube.com',
  categoryId: 'entertainment',
  ruleSource: 'dictionary',
  tabId: 1,
  windowId: 1,
  startTs: 0,
  flushedUntilTs: 0,
  lastHeartbeatTs: 0,
  rowDate: '2026-05-01',
  rowStartTs: 0,
  ...over,
});

async function log(s: OpenSession, date: string, fromTs: number, toTs: number, rowId?: number) {
  return repo.writeSegment({ session: s, rowId, date, rowStartTs: fromTs, fromTs, toTs });
}

describe('database', () => {
  it('seeds built-in categories and the example YouTube rule', async () => {
    const db = new SundialDB(`seed-${n++}`);
    await db.open();
    expect((await db.categories.toArray()).map((c) => c.id).sort()).toEqual([
      'entertainment',
      'neutral',
      'productive',
      'uncategorized',
    ]);
    expect(await db.domainRules.toArray()).toMatchObject([{ type: 'keyword', matchDomain: 'youtube.com', isExample: true }]);
  });
});

describe('writeSegment', () => {
  it('creates a row, then extends it, keeping aggregates in sync', async () => {
    const s = session();
    const id = await log(s, '2026-05-01', at(2026, 5, 1, 10), at(2026, 5, 1, 10, 0) + 30_000);
    await repo.writeSegment({
      session: s,
      rowId: id,
      date: '2026-05-01',
      rowStartTs: at(2026, 5, 1, 10),
      fromTs: at(2026, 5, 1, 10) + 30_000,
      toTs: at(2026, 5, 1, 10) + 60_000,
    });
    expect(await repo.db.sessions.toArray()).toMatchObject([{ id, durationMs: 60_000, key: 'youtube.com' }]);
    expect(await repo.dailyRange('2026-05-01', '2026-05-01')).toEqual([
      { date: '2026-05-01', key: 'youtube.com', domain: 'youtube.com', categoryId: 'entertainment', totalMs: 60_000 },
    ]);
  });

  it('is idempotent when a segment is retried', async () => {
    const s = session();
    const start = at(2026, 5, 1, 10);
    const id = await log(s, '2026-05-01', start, start + 30_000);
    const seg = { session: s, rowId: id, date: '2026-05-01', rowStartTs: start, fromTs: start + 30_000, toTs: start + 60_000 };
    await repo.writeSegment(seg);
    await repo.writeSegment(seg);
    expect((await repo.dailyRange('2026-05-01', '2026-05-01'))[0]!.totalMs).toBe(60_000);
  });

  it('fills hourly aggregates across hour boundaries', async () => {
    await log(session(), '2026-05-01', at(2026, 5, 1, 9, 45), at(2026, 5, 1, 10, 15));
    const hourly = await repo.hourlyRange('2026-05-01', '2026-05-01');
    expect(hourly.map((h) => [h.hour, h.totalMs / 60_000]).sort()).toEqual([
      [10, 15],
      [9, 15],
    ]);
  });

  it('recreates a row that was deleted underneath an open session', async () => {
    const s = session();
    const start = at(2026, 5, 1, 10);
    const id = await log(s, '2026-05-01', start, start + 30_000);
    await repo.db.sessions.clear();
    const newId = await repo.writeSegment({ session: s, rowId: id, date: '2026-05-01', rowStartTs: start, fromTs: start + 30_000, toTs: start + 60_000 });
    expect(await repo.db.sessions.get(newId)).toMatchObject({ startTs: start + 30_000, durationMs: 30_000 });
  });
});

describe('aggregate recomputation', () => {
  it('rebuildAggregates from sessions matches incremental aggregates', async () => {
    const yt = session();
    const gh = session({ key: 'github.com', domain: 'github.com', host: 'github.com', categoryId: 'productive' });
    await log(yt, '2026-05-01', at(2026, 5, 1, 9), at(2026, 5, 1, 9, 40));
    await log(gh, '2026-05-01', at(2026, 5, 1, 9, 40), at(2026, 5, 1, 11, 5));
    await log(yt, '2026-05-02', at(2026, 5, 2, 20), at(2026, 5, 2, 21));

    const before = {
      daily: await repo.db.dailyAggregates.toArray(),
      hourly: await repo.db.hourlyAggregates.toArray(),
    };
    await repo.db.dailyAggregates.clear();
    await repo.db.hourlyAggregates.clear();
    await repo.rebuildAggregates(['2026-05-01', '2026-05-02']);
    expect(await repo.db.dailyAggregates.toArray()).toEqual(before.daily);
    expect(await repo.db.hourlyAggregates.toArray()).toEqual(before.hourly);
  });

  it('never wipes aggregates for dates older than the session window', async () => {
    await repo.db.dailyAggregates.put({ date: '2025-12-01', key: 'a.com', domain: 'a.com', categoryId: 'neutral', totalMs: 5 });
    await repo.rebuildAggregates(['2025-12-01']);
    expect(await repo.db.dailyAggregates.count()).toBe(1);
  });

  it('sessionsToAggregates sums per (date, key, category)', () => {
    const base = { key: 'a.com', domain: 'a.com', categoryId: 'productive', date: '2026-05-01' };
    const { daily } = sessionsToAggregates([
      { ...base, startTs: at(2026, 5, 1, 1), endTs: at(2026, 5, 1, 2) },
      { ...base, startTs: at(2026, 5, 1, 3), endTs: at(2026, 5, 1, 3, 30) },
    ]);
    expect(daily).toEqual([{ ...base, totalMs: 90 * 60_000 }]);
  });
});

describe('setSiteCategory', () => {
  it('re-categorizes history when asked, rebuilding aggregates', async () => {
    await log(session(), '2026-05-01', at(2026, 5, 1, 9), at(2026, 5, 1, 10));
    await repo.setSiteCategory('youtube.com', 'productive', { applyToHistory: true });

    expect((await repo.db.sessions.toArray())[0]).toMatchObject({ categoryId: 'productive', ruleSource: 'domain' });
    const daily = await repo.dailyRange('2026-05-01', '2026-05-01');
    expect(daily).toEqual([expect.objectContaining({ categoryId: 'productive', totalMs: 3_600_000 })]);
    expect((await repo.db.hourlyAggregates.toArray()).every((h) => h.categoryId === 'productive')).toBe(true);
  });

  it('leaves history alone when not asked', async () => {
    await log(session(), '2026-05-01', at(2026, 5, 1, 9), at(2026, 5, 1, 10));
    await repo.setSiteCategory('youtube.com', 'productive', { applyToHistory: false });
    expect((await repo.db.sessions.toArray())[0]!.categoryId).toBe('entertainment');
    // ...but new time uses the rule.
    const cat = await repo.getCategorizer();
    expect(cat({ host: 'youtube.com', domain: 'youtube.com', path: '/', title: 'x' }).categoryId).toBe('productive');
  });

  it('keeps sessions that were logged under a keyword rule', async () => {
    await log(session({ categoryId: 'productive', ruleSource: 'keyword' }), '2026-05-01', at(2026, 5, 1, 9), at(2026, 5, 1, 10));
    await log(session(), '2026-05-01', at(2026, 5, 1, 11), at(2026, 5, 1, 12));
    await repo.setSiteCategory('youtube.com', 'neutral', { applyToHistory: true });
    const daily = await repo.dailyRange('2026-05-01', '2026-05-01');
    expect(Object.fromEntries(daily.map((d) => [d.categoryId, d.totalMs]))).toEqual({
      productive: 3_600_000,
      neutral: 3_600_000,
    });
  });

  it('relabels aggregates older than the session window, merging collisions', async () => {
    await repo.db.dailyAggregates.bulkPut([
      { date: '2025-06-01', key: 'youtube.com', domain: 'youtube.com', categoryId: 'entertainment', totalMs: 100 },
      { date: '2025-06-01', key: 'youtube.com', domain: 'youtube.com', categoryId: 'uncategorized', totalMs: 50 },
    ]);
    await repo.db.hourlyAggregates.put({ date: '2025-06-01', hour: 9, key: 'youtube.com', categoryId: 'entertainment', totalMs: 100 });
    await repo.setSiteCategory('youtube.com', 'productive', { applyToHistory: true });
    expect(await repo.db.dailyAggregates.toArray()).toEqual([
      { date: '2025-06-01', key: 'youtube.com', domain: 'youtube.com', categoryId: 'productive', totalMs: 150 },
    ]);
    expect(await repo.db.hourlyAggregates.toArray()).toEqual([
      { date: '2025-06-01', hour: 9, key: 'youtube.com', categoryId: 'productive', totalMs: 100 },
    ]);
  });

  it('uses a host rule for split subdomains', async () => {
    await repo.setSiteCategory('docs.google.com', 'neutral', { applyToHistory: false });
    expect(await repo.db.domainRules.where('matchDomain').equals('docs.google.com').toArray()).toMatchObject([
      { type: 'host', categoryId: 'neutral' },
    ]);
  });
});
