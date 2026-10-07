import { useMemo } from 'react';
import { hoursByKind, siteTotals, summarize } from '../core/summary';
import { updateSettings } from '../data/settings';
import { CategoryChip, Favicon, SplitBar, SunMark, Toggle } from '../ui/components';
import { DayDial } from '../ui/DayDial';
import { formatClock, formatDuration, formatPercent } from '../ui/format';
import { openDashboard, useCategories, useNow, useOpenSession, useRange, useSettings, withLive } from '../ui/hooks';
import { localDateKey } from '../core/time';

export function Popup() {
  const now = useNow(1000);
  const today = localDateKey(now);
  const cats = useCategories();
  const [settings] = useSettings();
  const open = useOpenSession();
  const range = useRange(today, today);

  const view = useMemo(() => {
    const r = { from: today, to: today };
    const daily = withLive(range.daily, open, now, r, 'daily');
    const hourly = withLive(range.hourly, open, now, r, 'hourly');
    return {
      summary: summarize(daily, cats.info),
      top: siteTotals(daily).slice(0, 3),
      hours: hoursByKind(hourly, cats.info),
    };
  }, [range.daily, range.hourly, open, now, today, cats.info]);

  const { summary, top, hours } = view;
  const paused = settings.paused;

  return (
    <div className="w-[340px] bg-bg text-ink">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <SunMark />
          Sundial
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          {paused ? 'Paused' : 'Tracking'}
          <Toggle checked={!paused} onChange={(on) => void updateSettings({ paused: !on })} label="Track browsing time" />
        </label>
      </header>

      <section className="flex items-center gap-4 px-4 pt-1 pb-4">
        <DayDial hours={hours} now={now} size={150}>
          <div className="leading-tight">
            <div className="text-[22px] font-semibold tracking-tight tabular-nums">{formatDuration(summary.totalMs)}</div>
            <div className="text-[11px] text-ink-3">today</div>
          </div>
        </DayDial>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="text-[11px] text-ink-3">Focus score</div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums">{formatPercent(summary.score)}</div>
          </div>
          <SplitBar kinds={summary.byKind} />
          <dl className="space-y-1 text-xs">
            <Row label="Productive" color="var(--cat-productive)" ms={summary.byKind.productive} />
            <Row label="Entertainment" color="var(--cat-entertainment)" ms={summary.byKind.entertainment} />
            <Row label="Other" color="var(--cat-neutral)" ms={summary.byKind.neutral + summary.byKind.uncategorized} />
          </dl>
        </div>
      </section>

      <section className="mx-3 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-line">
        {paused ? (
          <p className="py-1 text-sm text-ink-2">Tracking is paused. Nothing is being recorded.</p>
        ) : open ? (
          <div className="flex items-center gap-2.5">
            <Favicon site={open.host} size={20} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{open.key}</div>
              <div className="mt-0.5">
                <CategoryChip cat={cats.map.get(open.categoryId)} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{formatClock(now - open.startTs)}</div>
              <div className="text-[11px] text-ink-3">this visit</div>
            </div>
          </div>
        ) : (
          <p className="py-1 text-sm text-ink-2">Not counting right now. Time is recorded while a website is open in a focused window.</p>
        )}
      </section>

      <section className="px-4 pt-3">
        <h2 className="text-xs font-medium text-ink-3">Most time today</h2>
        {top.length === 0 ? (
          <p className="py-3 text-sm text-ink-3">Your top sites will show up here as you browse.</p>
        ) : (
          <ol className="mt-1.5 space-y-1.5">
            {top.map((s) => (
              <li key={s.key} className="flex items-center gap-2.5 text-sm">
                <Favicon site={s.key} />
                <span className="min-w-0 flex-1 truncate">{s.key}</span>
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: `var(--cat-${cats.map.get(s.categoryId)?.kind ?? 'uncategorized'})` }}
                  title={cats.map.get(s.categoryId)?.name}
                />
                <span className="w-14 text-right tabular-nums text-ink-2">{formatDuration(s.totalMs)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="p-3">
        <button
          type="button"
          onClick={() => void openDashboard().then(() => window.close())}
          className="w-full rounded-lg bg-ink py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          Open dashboard
        </button>
      </footer>
    </div>
  );
}

function Row({ label, color, ms }: { label: string; color: string; ms: number }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
      <dt className="flex-1 text-ink-2">{label}</dt>
      <dd className="tabular-nums">{formatDuration(ms)}</dd>
    </div>
  );
}
