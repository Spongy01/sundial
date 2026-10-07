import { updateSettings } from '../../data/settings';
import { DayDial } from '../../ui/DayDial';
import { emptyKinds } from '../../core/summary';
import { Toggle } from '../../ui/components';
import { useSettings } from '../../ui/hooks';
import { selectCls } from '../settings/shared';

const M = 60_000;
/** A made-up day so the dial explains itself before there is real data. */
const SAMPLE = Array.from({ length: 24 }, (_, h) => {
  const k = emptyKinds();
  if (h >= 9 && h <= 12) k.productive = (35 + ((h * 7) % 20)) * M;
  if (h >= 14 && h <= 17) k.productive = (25 + ((h * 11) % 25)) * M;
  if (h === 13) k.entertainment = 30 * M;
  if (h >= 20 && h <= 22) k.entertainment = (20 + h) * M;
  if (h === 9 || h === 15) k.neutral = 10 * M;
  return k;
});

export function Welcome() {
  const [settings] = useSettings();
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-12 md:px-6">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Sundial is keeping time.</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-2">
            It notices which site you're on and quietly adds up the minutes, so you can see how your browsing splits between focused work and
            everything else.
          </p>

          <ul className="mt-8 max-w-xl space-y-4 text-[15px]">
            <li>
              <p className="font-medium">Only the tab you're looking at counts.</p>
              <p className="text-ink-2">Time stops when you switch to another app, lock your screen, or step away. A playing video keeps it going.</p>
            </li>
            <li>
              <p className="font-medium">Only site names are saved.</p>
              <p className="text-ink-2">No page addresses, titles, or content. Everything stays in this browser, with no account and no servers.</p>
            </li>
            <li>
              <p className="font-medium">About 200 popular sites are already labelled.</p>
              <p className="text-ink-2">Anything else shows up under "Needs a label" on the dashboard, and one click sorts it.</p>
            </li>
          </ul>

          <div className="mt-8 max-w-xl rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <label htmlFor="w-idle" className="text-sm">
                Stop counting after I've been idle for
              </label>
              <select
                id="w-idle"
                value={settings.idleThresholdSec}
                onChange={(e) => void updateSettings({ idleThresholdSec: Number(e.target.value) })}
                className={selectCls}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-sm">Also track incognito windows</span>
              <Toggle checked={settings.trackIncognito} onChange={(v) => void updateSettings({ trackIncognito: v })} label="Also track incognito windows" />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#/" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
              Go to dashboard
            </a>
            <p className="text-sm text-ink-3">Tip: pin Sundial from the puzzle-piece menu so today's time is one click away.</p>
          </div>
        </div>

        <figure className="hidden justify-self-center text-center md:block">
          <DayDial hours={SAMPLE} now={new Date(2026, 0, 1, 16, 20).getTime()} size={280}>
            <div className="leading-tight">
              <div className="text-3xl font-semibold tabular-nums">7h 40m</div>
              <div className="text-xs text-ink-3">a sample day</div>
            </div>
          </DayDial>
          <figcaption className="mx-auto mt-4 max-w-64 text-sm text-ink-3">
            Your day as a dial, with noon at the top. Green is productive, orange is entertainment.
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
