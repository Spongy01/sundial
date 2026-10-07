import { describe, expect, it } from 'vitest';
import type { DailyAggregate } from './aggregate';
import { biggestTimeSink, comparePeriods, longestFocusStreak } from './insights';
import { dailyTrend, hourHeatmap, needsLabel, productivityScore, siteTotals, summarize, type CategoryInfo } from './summary';

const cats = new Map<string, CategoryInfo>([
  ['productive', { id: 'productive', kind: 'productive' }],
  ['entertainment', { id: 'entertainment', kind: 'entertainment' }],
  ['neutral', { id: 'neutral', kind: 'neutral' }],
  ['uncategorized', { id: 'uncategorized', kind: 'uncategorized' }],
  ['learning', { id: 'learning', kind: 'productive' }],
]);
const agg = (date: string, key: string, categoryId: string, min: number): DailyAggregate => ({
  date,
  key,
  domain: key,
  categoryId,
  totalMs: min * 60_000,
});
const M = 60_000;

describe('summary', () => {
  const rows = [
    agg('2026-05-01', 'github.com', 'productive', 60),
    agg('2026-05-01', 'coursera.org', 'learning', 30),
    agg('2026-05-01', 'youtube.com', 'entertainment', 30),
    agg('2026-05-01', 'youtube.com', 'productive', 15),
    agg('2026-05-02', 'nytimes.com', 'neutral', 20),
    agg('2026-05-02', 'mystery.dev', 'uncategorized', 10),
  ];

  it('totals by kind, counting custom categories under their kind', () => {
    const s = summarize(rows, cats);
    expect(s.totalMs).toBe(165 * M);
    expect(s.byKind).toEqual({ productive: 105 * M, entertainment: 30 * M, neutral: 20 * M, uncategorized: 10 * M });
    expect(s.score).toBeCloseTo(105 / 135);
  });

  it('scores null when there is no productive or entertainment time', () => {
    expect(productivityScore({ productive: 0, entertainment: 0 })).toBeNull();
  });

  it('ranks sites and picks the dominant category per site', () => {
    const sites = siteTotals(rows);
    expect(sites.map((s) => s.key)).toEqual(['github.com', 'youtube.com', 'coursera.org', 'nytimes.com', 'mystery.dev']);
    expect(sites[1]).toMatchObject({ totalMs: 45 * M, categoryId: 'entertainment' });
  });

  it('lists uncategorized sites as needing a label', () => {
    expect(needsLabel(rows, cats).map((s) => s.key)).toEqual(['mystery.dev']);
  });

  it('builds a trend row per day including empty days', () => {
    const t = dailyTrend(rows, '2026-04-30', '2026-05-02');
    expect(t.map((r) => r.date)).toEqual(['2026-04-30', '2026-05-01', '2026-05-02']);
    expect(t[1]).toMatchObject({ productive: 75 * M, entertainment: 30 * M, learning: 30 * M });
  });

  it('builds a weekday x hour heatmap with a productive/entertainment balance', () => {
    // 2026-05-04 is a Monday.
    const cells = hourHeatmap(
      [
        { date: '2026-05-04', hour: 9, key: 'a', categoryId: 'productive', totalMs: 30 * M },
        { date: '2026-05-04', hour: 9, key: 'b', categoryId: 'entertainment', totalMs: 10 * M },
        { date: '2026-05-10', hour: 22, key: 'b', categoryId: 'entertainment', totalMs: 10 * M },
      ],
      cats,
      true,
    );
    expect(cells).toHaveLength(7 * 24);
    expect(cells[0 * 24 + 9]).toMatchObject({ totalMs: 40 * M, balance: 0.5 });
    expect(cells[6 * 24 + 22]).toMatchObject({ balance: -1 });
    expect(cells[3 * 24 + 3]!.balance).toBeNull();
  });
});

describe('insights', () => {
  const t0 = new Date(2026, 4, 1, 9).getTime();
  const s = (key: string, categoryId: string, startMin: number, endMin: number) => ({
    key,
    categoryId,
    startTs: t0 + startMin * M,
    endTs: t0 + endMin * M,
  });

  it('finds the longest productive streak, broken by entertainment', () => {
    const streak = longestFocusStreak(
      [
        s('github.com', 'productive', 0, 30),
        s('youtube.com', 'entertainment', 30, 40),
        s('github.com', 'productive', 40, 60),
        s('gmail', 'neutral', 60, 65), // neutral doesn't break the streak
        s('docs', 'productive', 65, 120),
      ],
      cats,
    );
    expect(streak).toMatchObject({ startTs: t0 + 40 * M, endTs: t0 + 120 * M, productiveMs: 75 * M, keys: ['github.com', 'docs'] });
  });

  it('ends a streak on a long gap (user walked away)', () => {
    const streak = longestFocusStreak([s('a', 'productive', 0, 20), s('a', 'productive', 40, 50)], cats);
    expect(streak?.productiveMs).toBe(20 * M);
  });

  it('returns null without productive sessions', () => {
    expect(longestFocusStreak([s('y', 'entertainment', 0, 10)], cats)).toBeNull();
  });

  it('finds the biggest entertainment time sink', () => {
    expect(
      biggestTimeSink(
        [agg('d', 'reddit.com', 'entertainment', 40), agg('d', 'youtube.com', 'entertainment', 50), agg('d', 'github.com', 'productive', 500)],
        cats,
      )?.key,
    ).toBe('youtube.com');
  });

  it('compares this week with last week', () => {
    const c = comparePeriods(
      [agg('a', 'x', 'productive', 90), agg('a', 'y', 'entertainment', 30)],
      [agg('b', 'x', 'productive', 60), agg('b', 'y', 'entertainment', 60)],
      cats,
    );
    expect(c.totalChange).toBe(0);
    expect(c.productiveChange).toBe(0.5);
    expect(c.entertainmentChange).toBe(-0.5);
    expect(c.scoreDelta).toBeCloseTo(0.25);
  });
});
