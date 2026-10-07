/**
 * Local-timezone date helpers. Day and hour boundaries are always computed with
 * local Date constructors (never by adding 24h) so DST transitions are correct.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the user's local timezone. */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function nextLocalMidnight(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Parse `YYYY-MM-DD` as local midnight. */
export function dateKeyToTs(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

/** Shift a `YYYY-MM-DD` key by whole calendar days. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return localDateKey(new Date(y, m - 1, d + days).getTime());
}

export interface DaySlice {
  date: string;
  startTs: number;
  endTs: number;
}

/** Split [startTs, endTs) into pieces that each fall within one local day. */
export function splitAtMidnight(startTs: number, endTs: number): DaySlice[] {
  const out: DaySlice[] = [];
  let cursor = startTs;
  while (cursor < endTs) {
    const boundary = Math.min(nextLocalMidnight(cursor), endTs);
    out.push({ date: localDateKey(cursor), startTs: cursor, endTs: boundary });
    cursor = boundary;
  }
  return out;
}

export interface HourSlice {
  date: string;
  hour: number;
  ms: number;
}

function nextLocalHour(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
}

/** Split [startTs, endTs) into per-(local date, local hour) durations. */
export function splitByHour(startTs: number, endTs: number): HourSlice[] {
  const out: HourSlice[] = [];
  let cursor = startTs;
  while (cursor < endTs) {
    let boundary = nextLocalHour(cursor);
    // On fall-back the local clock repeats an hour; guard against a non-advancing boundary.
    if (boundary <= cursor) boundary = cursor + 3_600_000 - (cursor % 3_600_000);
    boundary = Math.min(boundary, endTs);
    const d = new Date(cursor);
    const date = localDateKey(cursor);
    const hour = d.getHours();
    const last = out[out.length - 1];
    if (last && last.date === date && last.hour === hour) last.ms += boundary - cursor;
    else out.push({ date, hour, ms: boundary - cursor });
    cursor = boundary;
  }
  return out;
}
