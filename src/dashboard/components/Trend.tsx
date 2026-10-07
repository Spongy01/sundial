import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Category } from '../../data/db';
import { Swatch } from '../../ui/components';
import { formatDateLabel, formatDuration, formatHour } from '../../ui/format';
import { categoryColor } from '../../ui/hooks';

type Row = Record<string, number | string>;

const HOUR = 3_600_000;

function niceTicks(maxMs: number): number[] {
  const steps = [15, 30, 60, 120, 180, 240, 360, 480, 720].map((m) => m * 60_000);
  const step = steps.find((s) => maxMs / s <= 4) ?? 720 * 60_000;
  const out = [];
  for (let v = 0; v <= maxMs + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1]! < maxMs) out.push(out[out.length - 1]! + step);
  return out;
}

/**
 * Stacked bars by category: one bar per day, or per hour for single-day ranges.
 * Categories that have no time in the range are left out of the legend.
 */
export function Trend({
  data,
  xKey,
  categories,
}: {
  data: Row[];
  xKey: 'date' | 'hour';
  categories: Category[];
}) {
  const present = categories.filter((c) => data.some((r) => Number(r[c.id] ?? 0) > 0));
  const max = Math.max(0, ...data.map((r) => present.reduce((a, c) => a + Number(r[c.id] ?? 0), 0)));
  const ticks = niceTicks(Math.max(max, xKey === 'hour' ? 15 * 60_000 : HOUR));
  const fmtX = (v: string | number) => (xKey === 'hour' ? formatHour(Number(v)) : formatDateLabel(String(v)));
  const dense = data.length > 14;

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{xKey === 'hour' ? 'Hour by hour' : 'Day by day'}</h2>
        {present.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            {present.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <Swatch cat={c} />
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={dense ? '18%' : '28%'} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <pattern id="hatch-trend" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--surface)" />
                <rect width="2" height="5" fill="var(--cat-uncategorized)" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey={xKey}
              tickFormatter={fmtX}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              interval={xKey === 'hour' ? 2 : dense ? 'preserveStartEnd' : 0}
              minTickGap={8}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]!]}
              tickFormatter={(v: number) => (v === 0 ? '' : formatDuration(v))}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = payload.filter((p) => Number(p.value) > 0);
                const total = rows.reduce((a, p) => a + Number(p.value), 0);
                return (
                  <div className="min-w-40 rounded-xl bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-line">
                    <div className="mb-1 flex justify-between gap-4 font-medium">
                      <span>{xKey === 'hour' ? `${formatHour(Number(label))}–${formatHour((Number(label) + 1) % 24)}` : formatDateLabel(String(label), 'long')}</span>
                      <span className="tabular-nums">{formatDuration(total)}</span>
                    </div>
                    {rows
                      .slice()
                      .reverse()
                      .map((p) => {
                        const c = present.find((x) => x.id === p.dataKey);
                        return (
                          <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-ink-2">
                            <Swatch cat={c} />
                            <span className="flex-1">{c?.name}</span>
                            <span className="tabular-nums">{formatDuration(Number(p.value))}</span>
                          </div>
                        );
                      })}
                  </div>
                );
              }}
            />
            {present.map((c, i) => (
              <Bar
                key={c.id}
                dataKey={c.id}
                stackId="t"
                fill={c.kind === 'uncategorized' ? 'url(#hatch-trend)' : categoryColor(c)}
                stroke="var(--surface)"
                strokeWidth={1}
                radius={i === present.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
