import { addDays, dateKeyToTs } from './time';

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface DateRange {
  preset: RangePreset;
  from: string;
  to: string;
  /** The equally long period immediately before, for comparisons. */
  prevFrom: string;
  prevTo: string;
  days: number;
}

export function dayCount(from: string, to: string): number {
  // Round to absorb 23/25h DST days.
  return Math.round((dateKeyToTs(to) - dateKeyToTs(from)) / 86_400_000) + 1;
}

export function resolveRange(preset: RangePreset, today: string, custom?: { from: string; to: string }): DateRange {
  let from: string;
  let to: string;
  switch (preset) {
    case 'today':
      from = to = today;
      break;
    case 'yesterday':
      from = to = addDays(today, -1);
      break;
    case '7d':
      from = addDays(today, -6);
      to = today;
      break;
    case '30d':
      from = addDays(today, -29);
      to = today;
      break;
    case 'custom': {
      const a = custom?.from ?? today;
      const b = custom?.to ?? today;
      [from, to] = a <= b ? [a, b] : [b, a];
      break;
    }
  }
  const days = dayCount(from, to);
  return { preset, from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}
