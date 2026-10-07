import type { DailyAggregate, HourlyAggregate } from './aggregate';
import { addDays, dateKeyToTs } from './time';
import type { CategoryKind } from './types';

export interface CategoryInfo {
  id: string;
  kind: CategoryKind;
}

export type KindTotals = Record<CategoryKind, number>;

export const emptyKinds = (): KindTotals => ({ productive: 0, entertainment: 0, neutral: 0, uncategorized: 0 });

export function kindOf(categoryId: string, cats: ReadonlyMap<string, CategoryInfo>): CategoryKind {
  return cats.get(categoryId)?.kind ?? 'uncategorized';
}

/** productive / (productive + entertainment), or null when there is nothing to score. */
export function productivityScore(k: Pick<KindTotals, 'productive' | 'entertainment'>): number | null {
  const denom = k.productive + k.entertainment;
  return denom > 0 ? k.productive / denom : null;
}

export interface Summary {
  totalMs: number;
  byKind: KindTotals;
  byCategory: Map<string, number>;
  score: number | null;
}

export function summarize(rows: readonly { categoryId: string; totalMs: number }[], cats: ReadonlyMap<string, CategoryInfo>): Summary {
  const byKind = emptyKinds();
  const byCategory = new Map<string, number>();
  let totalMs = 0;
  for (const r of rows) {
    totalMs += r.totalMs;
    byKind[kindOf(r.categoryId, cats)] += r.totalMs;
    byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + r.totalMs);
  }
  return { totalMs, byKind, byCategory, score: productivityScore(byKind) };
}

export interface SiteTotal {
  key: string;
  domain: string;
  totalMs: number;
  /** Category holding the most time for this site in the range. */
  categoryId: string;
  byCategory: Map<string, number>;
}

/** Per-site totals, largest first. */
export function siteTotals(rows: readonly DailyAggregate[]): SiteTotal[] {
  const map = new Map<string, SiteTotal>();
  for (const r of rows) {
    let s = map.get(r.key);
    if (!s) map.set(r.key, (s = { key: r.key, domain: r.domain, totalMs: 0, categoryId: r.categoryId, byCategory: new Map() }));
    s.totalMs += r.totalMs;
    s.byCategory.set(r.categoryId, (s.byCategory.get(r.categoryId) ?? 0) + r.totalMs);
  }
  for (const s of map.values()) {
    let best = -1;
    for (const [id, ms] of s.byCategory) if (ms > best) [best, s.categoryId] = [ms, id];
  }
  return [...map.values()].sort((a, b) => b.totalMs - a.totalMs || a.key.localeCompare(b.key));
}

/** Sites whose time is mostly uncategorized. */
export function needsLabel(rows: readonly DailyAggregate[], cats: ReadonlyMap<string, CategoryInfo>): SiteTotal[] {
  return siteTotals(rows).filter((s) => kindOf(s.categoryId, cats) === 'uncategorized');
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One row per date with ms per categoryId, including empty days. */
export function dailyTrend(rows: readonly DailyAggregate[], from: string, to: string): Array<{ date: string } & Record<string, number | string>> {
  const byDate = new Map(datesBetween(from, to).map((d) => [d, { date: d } as { date: string } & Record<string, number | string>]));
  for (const r of rows) {
    const row = byDate.get(r.date);
    if (row) row[r.categoryId] = ((row[r.categoryId] as number | undefined) ?? 0) + r.totalMs;
  }
  return [...byDate.values()];
}

export interface HeatCell {
  /** 0 = Monday … 6 = Sunday, or 0 for a single-row heatmap. */
  row: number;
  hour: number;
  totalMs: number;
  productive: number;
  entertainment: number;
  /** -1 (all entertainment) … +1 (all productive); null when neither. */
  balance: number | null;
}

/**
 * Hour-of-day grid. With `byWeekday`, rows are Mon–Sun; otherwise one row
 * summing every day in the range.
 */
export function hourHeatmap(rows: readonly HourlyAggregate[], cats: ReadonlyMap<string, CategoryInfo>, byWeekday: boolean): HeatCell[] {
  const nRows = byWeekday ? 7 : 1;
  const cells: HeatCell[] = [];
  for (let row = 0; row < nRows; row++) {
    for (let hour = 0; hour < 24; hour++) cells.push({ row, hour, totalMs: 0, productive: 0, entertainment: 0, balance: null });
  }
  for (const r of rows) {
    const row = byWeekday ? (new Date(dateKeyToTs(r.date)).getDay() + 6) % 7 : 0;
    const c = cells[row * 24 + r.hour]!;
    c.totalMs += r.totalMs;
    const kind = kindOf(r.categoryId, cats);
    if (kind === 'productive') c.productive += r.totalMs;
    if (kind === 'entertainment') c.entertainment += r.totalMs;
  }
  for (const c of cells) {
    const d = c.productive + c.entertainment;
    c.balance = d > 0 ? (c.productive - c.entertainment) / d : null;
  }
  return cells;
}

/** Minutes tracked per hour for one day, split by kind (for the day dial). */
export function hoursByKind(rows: readonly HourlyAggregate[], cats: ReadonlyMap<string, CategoryInfo>): KindTotals[] {
  const hours = Array.from({ length: 24 }, emptyKinds);
  for (const r of rows) hours[r.hour]![kindOf(r.categoryId, cats)] += r.totalMs;
  return hours;
}
