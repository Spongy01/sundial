import { useState, type ReactNode } from 'react';
import type { KindTotals } from '../core/summary';
import { formatDuration, formatHour } from './format';

const HOUR = 3_600_000;
const STACK = ['productive', 'neutral', 'uncategorized', 'entertainment'] as const;

/** Angle for a (fractional) hour. Noon sits at the top, like a sundial. */
const angle = (h: number) => ((h - 12) / 24) * Math.PI * 2 - Math.PI / 2;

function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/**
 * Today as a 24-hour dial. Each hour is a wedge whose length shows how much of
 * that hour was spent in the browser, stacked outward by kind. The hand is the
 * gnomon's shadow pointing at the current time.
 */
export function DayDial({
  hours,
  now,
  size = 168,
  showHand = true,
  children,
}: {
  hours: KindTotals[];
  now: number;
  size?: number;
  showHand?: boolean;
  children?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const c = size / 2;
  const r0 = size * 0.285;
  const r1 = size * 0.395;
  const pad = 0.012; // radians of gap between wedges
  const d = new Date(now);
  const nowH = d.getHours() + d.getMinutes() / 60;
  const hovered = hover === null ? null : hours[hover];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Browser time by hour today">
        {hours.map((k, h) => {
          const a0 = angle(h) + pad;
          const a1 = angle(h + 1) - pad;
          const total = STACK.reduce((a, s) => a + k[s], 0);
          let r = r0;
          return (
            <g key={h} onMouseEnter={() => setHover(h)} onMouseLeave={() => setHover(null)}>
              <path d={sector(c, c, r0, r1, a0, a1)} fill="var(--surface-2)" opacity={hover === h ? 1 : 0.55} />
              {total > 0 &&
                STACK.filter((s) => k[s] > 0).map((s) => {
                  const len = Math.max(1, (Math.min(k[s], HOUR) / HOUR) * (r1 - r0));
                  const path = sector(c, c, r, Math.min(r1, r + len), a0, a1);
                  r += len;
                  return (
                    <path
                      key={s}
                      d={path}
                      fill={s === 'uncategorized' ? 'var(--cat-uncategorized)' : `var(--cat-${s})`}
                      opacity={s === 'uncategorized' ? 0.7 : 1}
                    />
                  );
                })}
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => {
          const a = angle(h);
          const r = r1 + size * 0.055;
          return (
            <text
              key={h}
              x={c + r * Math.cos(a)}
              y={c + r * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.max(9, size * 0.058)}
              fill="var(--ink-3)"
            >
              {h === 12 ? '12p' : h === 0 ? '12a' : h === 6 ? '6a' : '6p'}
            </text>
          );
        })}
        {showHand && (
          <line
            x1={c + (r0 - 2) * Math.cos(angle(nowH))}
            y1={c + (r0 - 2) * Math.sin(angle(nowH))}
            x2={c + (r1 + 3) * Math.cos(angle(nowH))}
            y2={c + (r1 + 3) * Math.sin(angle(nowH))}
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {hovered && hover !== null ? (
          <div className="leading-tight">
            <div className="text-[11px] text-ink-3">
              {formatHour(hover)}–{formatHour((hover + 1) % 24)}
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {formatDuration(STACK.reduce((a, s) => a + hovered[s], 0))}
            </div>
            {hovered.productive + hovered.entertainment > 0 && (
              <div className="text-[11px] text-ink-3 tabular-nums">
                {formatDuration(hovered.productive)} prod, {formatDuration(hovered.entertainment)} ent
              </div>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
