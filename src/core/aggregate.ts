import { splitByHour } from './time';

export interface SessionLike {
  date: string;
  key: string;
  domain: string;
  categoryId: string;
  startTs: number;
  endTs: number;
}

export interface DailyAggregate {
  date: string;
  key: string;
  domain: string;
  categoryId: string;
  totalMs: number;
}

export interface HourlyAggregate {
  date: string;
  hour: number;
  key: string;
  categoryId: string;
  totalMs: number;
}

export const dailyId = (a: Pick<DailyAggregate, 'date' | 'key' | 'categoryId'>) => [a.date, a.key, a.categoryId] as const;
export const hourlyId = (a: Pick<HourlyAggregate, 'date' | 'hour' | 'key' | 'categoryId'>) =>
  [a.date, a.hour, a.key, a.categoryId] as const;

/** Bucket one interval of time into daily and hourly aggregate deltas. */
export function intervalToAggregates(
  meta: Pick<SessionLike, 'key' | 'domain' | 'categoryId'>,
  fromTs: number,
  toTs: number,
): { daily: DailyAggregate[]; hourly: HourlyAggregate[] } {
  const daily = new Map<string, DailyAggregate>();
  const hourly: HourlyAggregate[] = [];
  for (const h of splitByHour(fromTs, toTs)) {
    hourly.push({ date: h.date, hour: h.hour, key: meta.key, categoryId: meta.categoryId, totalMs: h.ms });
    const d = daily.get(h.date);
    if (d) d.totalMs += h.ms;
    else daily.set(h.date, { date: h.date, key: meta.key, domain: meta.domain, categoryId: meta.categoryId, totalMs: h.ms });
  }
  return { daily: [...daily.values()], hourly };
}

/** Recompute aggregates from scratch from raw sessions. */
export function sessionsToAggregates(sessions: readonly SessionLike[]): {
  daily: DailyAggregate[];
  hourly: HourlyAggregate[];
} {
  const daily = new Map<string, DailyAggregate>();
  const hourly = new Map<string, HourlyAggregate>();
  for (const s of sessions) {
    const parts = intervalToAggregates(s, s.startTs, s.endTs);
    for (const d of parts.daily) {
      const id = dailyId(d).join('|');
      const cur = daily.get(id);
      if (cur) cur.totalMs += d.totalMs;
      else daily.set(id, d);
    }
    for (const h of parts.hourly) {
      const id = hourlyId(h).join('|');
      const cur = hourly.get(id);
      if (cur) cur.totalMs += h.totalMs;
      else hourly.set(id, h);
    }
  }
  return { daily: [...daily.values()], hourly: [...hourly.values()] };
}
