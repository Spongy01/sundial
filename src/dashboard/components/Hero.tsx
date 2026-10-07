import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { DateRange } from '../../core/range';
import type { Summary } from '../../core/summary';
import { formatDuration, formatPercent } from '../../ui/format';

const SLICES = [
  { kind: 'productive', label: 'Productive', fill: 'var(--cat-productive)' },
  { kind: 'entertainment', label: 'Entertainment', fill: 'var(--cat-entertainment)' },
  { kind: 'neutral', label: 'Neutral', fill: 'var(--cat-neutral)' },
  { kind: 'uncategorized', label: 'Uncategorized', fill: 'url(#hatch-uncat)' },
] as const;

function rangePhrase(r: DateRange): string {
  switch (r.preset) {
    case 'today':
      return 'today';
    case 'yesterday':
      return 'yesterday';
    case '7d':
      return 'in the last 7 days';
    case '30d':
      return 'in the last 30 days';
    default:
      return r.days === 1 ? 'on this day' : `over these ${r.days} days`;
  }
}

function previousPhrase(r: DateRange): string {
  if (r.preset === 'today') return 'yesterday';
  if (r.preset === 'yesterday') return 'the day before';
  return r.days === 1 ? 'the previous day' : `the previous ${r.days} days`;
}

export function Hero({ summary, previous, range }: { summary: Summary; previous: Summary; range: DateRange }) {
  const data = SLICES.map((s) => ({ ...s, value: summary.byKind[s.kind] })).filter((d) => d.value > 0);
  const change = previous.totalMs > 0 ? (summary.totalMs - previous.totalMs) / previous.totalMs : null;

  return (
    <section className="grid items-center gap-8 rounded-3xl bg-surface p-6 ring-1 ring-line md:grid-cols-[1fr_auto] md:p-8">
      <div>
        <p className="text-sm text-ink-3">Time in your browser {rangePhrase(range)}</p>
        <p className="mt-1 text-6xl font-semibold tracking-[-0.035em] tabular-nums md:text-7xl">{formatDuration(summary.totalMs)}</p>
        <p className="mt-3 max-w-md text-sm text-ink-2">
          {change === null
            ? 'Nothing to compare against yet.'
            : Math.abs(change) < 0.05
              ? `About the same as ${previousPhrase(range)}.`
              : `${Math.round(Math.abs(change) * 100)}% ${change > 0 ? 'more' : 'less'} than ${previousPhrase(range)} (${formatDuration(previous.totalMs)}).`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="relative size-[176px]">
          {data.length > 0 ? (
            <PieChart width={176} height={176}>
              <defs>
                <pattern id="hatch-uncat" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill="var(--surface)" />
                  <rect width="2" height="5" fill="var(--cat-uncategorized)" />
                </pattern>
              </defs>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={62}
                outerRadius={84}
                startAngle={90}
                endAngle={-270}
                paddingAngle={data.length > 1 ? 1.5 : 0}
                stroke="var(--surface)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.kind} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded-lg bg-surface px-2.5 py-1.5 text-xs shadow-md ring-1 ring-line">
                      <span className="font-medium">{String(payload[0].name)}</span>{' '}
                      <span className="tabular-nums text-ink-2">{formatDuration(Number(payload[0].value))}</span>
                    </div>
                  ) : null
                }
              />
            </PieChart>
          ) : (
            <div className="size-full rounded-full border-[22px] border-surface-2" />
          )}
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{formatPercent(summary.score)}</div>
              <div className="text-[11px] text-ink-3">focus score</div>
            </div>
          </div>
        </div>
        <ul className="min-w-44 space-y-2 text-sm">
          {SLICES.map((s) => {
            const v = summary.byKind[s.kind];
            if (s.kind === 'uncategorized' && v === 0) return null;
            return (
              <li key={s.kind} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${s.kind === 'uncategorized' ? 'hatch ring-1 ring-[var(--cat-uncategorized)] ring-inset' : ''}`}
                  style={s.kind === 'uncategorized' ? undefined : { background: s.fill }}
                />
                <span className="flex-1 text-ink-2">{s.label}</span>
                <span className="tabular-nums font-medium">{formatDuration(v)}</span>
                <span className="w-9 text-right tabular-nums text-ink-3">
                  {summary.totalMs ? `${Math.round((v / summary.totalMs) * 100)}%` : ''}
                </span>
              </li>
            );
          })}
          <li className="pt-1 text-xs text-ink-3">Focus score = productive ÷ (productive + entertainment)</li>
        </ul>
      </div>
    </section>
  );
}
