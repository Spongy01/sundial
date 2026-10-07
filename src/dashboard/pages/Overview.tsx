import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { biggestTimeSink, comparePeriods, longestFocusStreak } from '../../core/insights';
import type { DateRange } from '../../core/range';
import { dailyTrend, hourHeatmap, needsLabel, siteTotals, summarize } from '../../core/summary';
import { addDays } from '../../core/time';
import { db } from '../../data/db';
import { useCategories, useNow, useOpenSession, useRange, withLive } from '../../ui/hooks';
import { Hero } from '../components/Hero';
import { HourHeatmap } from '../components/HourHeatmap';
import { Insights } from '../components/Insights';
import { NeedsLabel } from '../components/NeedsLabel';
import { TopSites } from '../components/TopSites';
import { Trend } from '../components/Trend';

export function Overview({ range, today }: { range: DateRange; today: string }) {
  const cats = useCategories();
  const open = useOpenSession();
  // Live totals only matter when today is in range; tick slowly to stay calm.
  const now = useNow(range.to >= today ? 5000 : 60_000);

  const current = useRange(range.from, range.to);
  const previous = useRange(range.prevFrom, range.prevTo);

  // Insights always look at the last 7 days vs the 7 before.
  const weekFrom = addDays(today, -6);
  const prevWeekFrom = addDays(today, -13);
  const weekRows = useLiveQuery(() => db.dailyAggregates.where('date').between(prevWeekFrom, today, true, true).toArray(), [prevWeekFrom, today]);
  const weekSessions = useLiveQuery(
    () => db.sessions.where('date').between(weekFrom, today, true, true).toArray(),
    [weekFrom, today],
  );

  const view = useMemo(() => {
    const r = { from: range.from, to: range.to };
    const daily = withLive(current.daily, open, now, r, 'daily');
    const hourly = withLive(current.hourly, open, now, r, 'hourly');
    const single = range.days === 1;
    const trendData = single
      ? Array.from({ length: 24 }, (_, hour) => {
          const row: Record<string, number | string> = { hour };
          for (const h of hourly) if (h.hour === hour) row[h.categoryId] = Number(row[h.categoryId] ?? 0) + h.totalMs;
          return row;
        })
      : dailyTrend(daily, range.from, range.to);
    const week = weekRows ?? [];
    return {
      summary: summarize(daily, cats.info),
      previous: summarize(previous.daily ?? [], cats.info),
      sites: siteTotals(daily),
      unlabeled: needsLabel(daily, cats.info),
      trendData,
      heat: hourHeatmap(hourly, cats.info, range.days >= 7),
      sink: biggestTimeSink(
        week.filter((d) => d.date >= weekFrom),
        cats.info,
      ),
      week: comparePeriods(
        week.filter((d) => d.date >= weekFrom),
        week.filter((d) => d.date < weekFrom),
        cats.info,
      ),
      streak: longestFocusStreak(weekSessions ?? [], cats.info),
    };
  }, [current.daily, current.hourly, previous.daily, open, now, range, cats.info, weekRows, weekSessions, weekFrom]);

  if (!current.loaded || !cats.loaded) {
    return <div className="h-96 animate-pulse rounded-3xl bg-surface-2/60" aria-label="Loading" />;
  }

  return (
    <div className="space-y-5">
      <Hero summary={view.summary} previous={view.previous} range={range} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <TopSites sites={view.sites} />
        <div className="space-y-5">
          <NeedsLabel sites={view.unlabeled} />
          <Insights sink={view.sink} week={view.week} streak={view.streak} />
        </div>
      </div>
      <Trend data={view.trendData} xKey={range.days === 1 ? 'hour' : 'date'} categories={cats.list} />
      <HourHeatmap cells={view.heat} byWeekday={range.days >= 7} />
    </div>
  );
}
