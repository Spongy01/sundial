import type { DailyAggregate } from './aggregate';
import { kindOf, siteTotals, summarize, type CategoryInfo, type SiteTotal, type Summary } from './summary';

export interface SessionSlice {
  key: string;
  categoryId: string;
  startTs: number;
  endTs: number;
}

/** Gaps longer than this (idle, away) end a focus streak. */
export const STREAK_GAP_MS = 5 * 60_000;

export interface FocusStreak {
  startTs: number;
  endTs: number;
  /** Productive time inside the streak. */
  productiveMs: number;
  keys: string[];
}

/**
 * Longest stretch of productive work not interrupted by entertainment.
 * Neutral/uncategorized sessions don't break a streak (checking mail mid-task is
 * fine) but don't count toward it either; a gap over STREAK_GAP_MS ends it.
 */
export function longestFocusStreak(
  sessions: readonly SessionSlice[],
  cats: ReadonlyMap<string, CategoryInfo>,
): FocusStreak | null {
  const sorted = [...sessions].sort((a, b) => a.startTs - b.startTs);
  let best: FocusStreak | null = null;
  let cur: FocusStreak | null = null;
  let lastEnd = -Infinity;

  const commit = () => {
    if (cur && (!best || cur.productiveMs > best.productiveMs)) best = cur;
    cur = null;
  };

  for (const s of sorted) {
    if (s.startTs - lastEnd > STREAK_GAP_MS) commit();
    const kind = kindOf(s.categoryId, cats);
    if (kind === 'entertainment') {
      commit();
    } else if (kind === 'productive') {
      if (!cur) cur = { startTs: s.startTs, endTs: s.endTs, productiveMs: 0, keys: [] };
      cur.endTs = s.endTs;
      cur.productiveMs += s.endTs - s.startTs;
      if (!cur.keys.includes(s.key)) cur.keys.push(s.key);
    }
    lastEnd = Math.max(lastEnd, s.endTs);
  }
  commit();
  return best;
}

/** The entertainment site with the most time. */
export function biggestTimeSink(rows: readonly DailyAggregate[], cats: ReadonlyMap<string, CategoryInfo>): SiteTotal | null {
  return siteTotals(rows.filter((r) => kindOf(r.categoryId, cats) === 'entertainment'))[0] ?? null;
}

export interface Comparison {
  current: Summary;
  previous: Summary;
  /** Relative change in total time; null when the previous period is empty. */
  totalChange: number | null;
  productiveChange: number | null;
  entertainmentChange: number | null;
  /** Percentage-point change in productivity score. */
  scoreDelta: number | null;
}

const rel = (a: number, b: number) => (b > 0 ? (a - b) / b : null);

export function comparePeriods(
  current: readonly DailyAggregate[],
  previous: readonly DailyAggregate[],
  cats: ReadonlyMap<string, CategoryInfo>,
): Comparison {
  const c = summarize(current, cats);
  const p = summarize(previous, cats);
  return {
    current: c,
    previous: p,
    totalChange: rel(c.totalMs, p.totalMs),
    productiveChange: rel(c.byKind.productive, p.byKind.productive),
    entertainmentChange: rel(c.byKind.entertainment, p.byKind.entertainment),
    scoreDelta: c.score !== null && p.score !== null ? c.score - p.score : null,
  };
}
