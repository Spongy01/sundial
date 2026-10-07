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

/** Live timer: "45s", "12m 04s", "1h 02m". Units avoid reading as a time of day. */
export function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${two(m)}m`;
  if (m > 0) return `${m}m ${two(s)}s`;
  return `${s}s`;
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
