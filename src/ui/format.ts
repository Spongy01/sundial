/** "2h 5m", "12m", "45s", "0m". */
export function formatDuration(ms: number, opts: { seconds?: boolean } = {}): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return opts.seconds && m < 10 && s ? `${m}m ${s}s` : `${m}m`;
  return opts.seconds ? `${s}s` : totalSec > 0 ? '<1m' : '0m';
}

/** Stopwatch format: "4:07", "1:02:33". */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatPercent(x: number | null): string {
  return x === null ? '–' : `${Math.round(x * 100)}%`;
}

export function formatHour(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${suffix}`;
}

export function formatDateLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, style === 'short' ? { month: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' });
}
