import { describe, expect, it } from 'vitest';
import { addDays, localDateKey, splitAtMidnight, splitByHour } from './time';

// Tests run with TZ=America/New_York (see package.json / vitest.config.ts).
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const H = 3_600_000;

describe('splitAtMidnight', () => {
  it('returns a single slice when the interval stays within one day', () => {
    expect(splitAtMidnight(at(2026, 5, 1, 9), at(2026, 5, 1, 10))).toEqual([
      { date: '2026-05-01', startTs: at(2026, 5, 1, 9), endTs: at(2026, 5, 1, 10) },
    ]);
  });

  it('splits a session spanning midnight across both local days', () => {
    const slices = splitAtMidnight(at(2026, 5, 1, 23, 30), at(2026, 5, 2, 0, 45));
    expect(slices.map((s) => [s.date, s.endTs - s.startTs])).toEqual([
      ['2026-05-01', 30 * 60_000],
      ['2026-05-02', 45 * 60_000],
    ]);
    expect(slices[0]!.endTs).toBe(at(2026, 5, 2));
  });

  it('handles multi-day spans', () => {
    expect(splitAtMidnight(at(2026, 5, 1, 12), at(2026, 5, 3, 12)).map((s) => s.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
  });

  it('respects a 23-hour DST day (spring forward)', () => {
    // 2026-03-08 is 23h long in New York.
    const [a, b] = splitAtMidnight(at(2026, 3, 7, 23), at(2026, 3, 9, 1));
    expect(b!.date).toBe('2026-03-08');
    expect(b!.endTs - b!.startTs).toBe(23 * H);
    expect(a!.endTs - a!.startTs).toBe(1 * H);
  });

  it('respects a 25-hour DST day (fall back)', () => {
    const slices = splitAtMidnight(at(2026, 11, 1, 0), at(2026, 11, 2, 0));
    expect(slices).toHaveLength(1);
    expect(slices[0]!.endTs - slices[0]!.startTs).toBe(25 * H);
  });

  it('returns nothing for an empty interval', () => {
    expect(splitAtMidnight(1000, 1000)).toEqual([]);
  });
});

describe('splitByHour', () => {
  it('buckets by local hour and sums to the full duration', () => {
    const start = at(2026, 5, 1, 9, 50);
    const end = at(2026, 5, 1, 11, 10);
    const slices = splitByHour(start, end);
    expect(slices.map((s) => [s.hour, s.ms / 60_000])).toEqual([
      [9, 10],
      [10, 60],
      [11, 10],
    ]);
  });

  it('assigns hours to the correct day across midnight', () => {
    const slices = splitByHour(at(2026, 5, 1, 23, 30), at(2026, 5, 2, 0, 30));
    expect(slices).toEqual([
      { date: '2026-05-01', hour: 23, ms: 30 * 60_000 },
      { date: '2026-05-02', hour: 0, ms: 30 * 60_000 },
    ]);
  });

  it('never loses time across DST transitions', () => {
    for (const [s, e] of [
      [at(2026, 3, 8, 0), at(2026, 3, 8, 5)],
      [at(2026, 11, 1, 0), at(2026, 11, 1, 5)],
    ] as const) {
      expect(splitByHour(s, e).reduce((a, x) => a + x.ms, 0)).toBe(e - s);
    }
  });
});

describe('date keys', () => {
  it('formats in local time and shifts by calendar days', () => {
    expect(localDateKey(at(2026, 1, 9, 23, 59))).toBe('2026-01-09');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});
