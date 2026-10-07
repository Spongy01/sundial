import { useState, type ReactNode } from 'react';
import type { HeatCell } from '../../core/summary';
import { formatDuration, formatHour } from '../../ui/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Diverging fill: productive hue ↔ neutral gray ↔ entertainment hue by balance,
 * with time spent controlling how strongly it shows against the surface.
 */
function cellColor(c: HeatCell, maxMs: number): string {
  if (c.totalMs === 0) return 'var(--surface-2)';
  const intensity = 0.22 + 0.78 * Math.sqrt(c.totalMs / maxMs);
  let hue: string;
  if (c.balance === null) hue = 'var(--ink-3)';
  else {
    const pole = c.balance >= 0 ? 'var(--cat-productive)' : 'var(--cat-entertainment)';
    hue = `color-mix(in oklab, ${pole} ${Math.round(Math.abs(c.balance) * 100)}%, var(--ink-3))`;
  }
  return `color-mix(in oklab, ${hue} ${Math.round(intensity * 100)}%, var(--surface-2))`;
}

function describe(c: HeatCell): string {
  if (c.totalMs === 0) return 'No browsing';
  if (c.balance === null) return 'Neutral sites only';
  if (c.balance > 0.33) return 'Mostly productive';
  if (c.balance < -0.33) return 'Mostly entertainment';
  return 'Mixed';
}

export function HourHeatmap({ cells, byWeekday }: { cells: HeatCell[]; byWeekday: boolean }) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const rows = byWeekday ? 7 : 1;
  const maxMs = Math.max(1, ...cells.map((c) => c.totalMs));

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">When you focus</h2>
          <p className="mt-0.5 text-sm text-ink-3">
            {byWeekday ? 'Each square is one hour of one weekday, summed over the range.' : 'Each square is one hour of the day.'} Darker
            means more time.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-2" aria-hidden>
          <span>Entertainment</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--cat-entertainment), var(--ink-3), var(--cat-productive))' }}
          />
          <span>Productive</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[560px]">
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `${byWeekday ? '2.5rem' : '0'} repeat(24, minmax(0, 1fr))` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: rows }, (_, r) => (
              <Row key={r} label={byWeekday ? WEEKDAYS[r]! : ''}>
                {cells
                  .filter((c) => c.row === r)
                  .map((c) => (
                    <div
                      key={c.hour}
                      role="img"
                      aria-label={`${byWeekday ? `${WEEKDAYS[r]} ` : ''}${formatHour(c.hour)}: ${formatDuration(c.totalMs)}, ${describe(c)}`}
                      onMouseEnter={() => setHover(c)}
                      className={`aspect-square rounded-[4px] ${hover === c ? 'ring-2 ring-ink' : ''}`}
                      style={{ background: cellColor(c, maxMs), maxHeight: byWeekday ? undefined : 36 }}
                    />
                  ))}
              </Row>
            ))}
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pt-1 text-center text-[10px] text-ink-3">
                {h % 3 === 0 ? formatHour(h) : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 h-5 text-sm text-ink-2" aria-live="polite">
        {hover &&
          `${byWeekday ? `${WEEKDAYS[hover.row]}s, ` : ''}${formatHour(hover.hour)}–${formatHour((hover.hour + 1) % 24)}: ${formatDuration(hover.totalMs)}. ${describe(hover)}${
            hover.productive + hover.entertainment > 0
              ? ` (${formatDuration(hover.productive)} productive, ${formatDuration(hover.entertainment)} entertainment)`
              : ''
          }.`}
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="self-center pr-2 text-xs text-ink-3">{label}</div>
      {children}
    </>
  );
}
