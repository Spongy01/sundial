import type { Comparison, FocusStreak } from '../../core/insights';
import type { SiteTotal } from '../../core/summary';
import { Favicon } from '../../ui/components';
import { formatDuration } from '../../ui/format';

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

function weekSentence(c: Comparison): string {
  if (c.previous.totalMs === 0) return 'Not enough history yet. Check back after a full week.';
  const parts: string[] = [];
  if (c.productiveChange !== null && Math.abs(c.productiveChange) >= 0.05) {
    parts.push(`productive time ${c.productiveChange > 0 ? 'up' : 'down'} ${pct(c.productiveChange)}`);
  }
  if (c.entertainmentChange !== null && Math.abs(c.entertainmentChange) >= 0.05) {
    parts.push(`entertainment ${c.entertainmentChange > 0 ? 'up' : 'down'} ${pct(c.entertainmentChange)}`);
  }
  if (!parts.length) return 'Your split is about the same as the week before.';
  const s = parts.join(', ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} compared with the week before.`;
}

export function Insights({ sink, week, streak }: { sink: SiteTotal | null; week: Comparison; streak: FocusStreak | null }) {
  const scoreDelta = week.scoreDelta;
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 className="text-base font-semibold">This week</h2>
      <dl className="mt-3 space-y-4 text-sm">
        <div>
          <dt className="text-ink-3">Biggest time sink</dt>
          <dd className="mt-1">
            {sink ? (
              <span className="flex items-center gap-2">
                <Favicon site={sink.key} />
                <span className="font-medium">{sink.key}</span>
                <span className="text-ink-2 tabular-nums">{formatDuration(sink.totalMs)}</span>
              </span>
            ) : (
              <span className="text-ink-2">No entertainment time in the last 7 days.</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Compared with last week</dt>
          <dd className="mt-1 text-ink-2">
            {weekSentence(week)}
            {scoreDelta !== null && Math.abs(scoreDelta) >= 0.01 && (
              <span className="mt-1 block text-ink">
                Focus score {scoreDelta > 0 ? 'up' : 'down'} {Math.round(Math.abs(scoreDelta) * 100)} points.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Longest focus streak</dt>
          <dd className="mt-1">
            {streak ? (
              <>
                <span className="font-medium tabular-nums">{formatDuration(streak.productiveMs)}</span>
                <span className="text-ink-2">
                  {' '}
                  of productive time on{' '}
                  {new Date(streak.startTs).toLocaleDateString(undefined, { weekday: 'long' })},{' '}
                  {new Date(streak.startTs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} to{' '}
                  {new Date(streak.endTs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}, without
                  switching to entertainment.
                </span>
              </>
            ) : (
              <span className="text-ink-2">No productive streaks in the last 7 days yet.</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
