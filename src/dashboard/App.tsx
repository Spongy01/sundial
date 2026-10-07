import { useEffect, useState, type ReactNode } from 'react';
import { resolveRange, type RangePreset } from '../core/range';
import { SunMark } from '../ui/components';
import { useToday } from '../ui/hooks';
import { RangeSwitcher } from './components/RangeSwitcher';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';

export type Route = 'overview' | 'settings' | 'welcome';

function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  return h === 'settings' || h === 'welcome' ? h : 'overview';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const RANGE_KEY = 'sundial.range';

function loadRange(): { preset: RangePreset; custom: { from: string; to: string } } | null {
  try {
    return JSON.parse(localStorage.getItem(RANGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function App({ welcome }: { welcome?: ReactNode }) {
  const route = useRoute();
  const today = useToday();
  const saved = loadRange();
  const [preset, setPreset] = useState<RangePreset>(saved?.preset ?? 'today');
  const [custom, setCustom] = useState(saved?.custom ?? { from: today, to: today });
  const range = resolveRange(preset, today, custom);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ preset, custom }));
    } catch {
      /* per-viewer convenience only */
    }
  }, [preset, custom]);

  useEffect(() => {
    document.title = route === 'settings' ? 'Sundial settings' : 'Sundial';
  }, [route]);

  if (route === 'welcome' && welcome) return <>{welcome}</>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-5">
            <a href="#/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
              <SunMark size={20} />
              Sundial
            </a>
            <nav className="flex gap-1 text-sm">
              <NavLink href="#/" active={route === 'overview'}>
                Overview
              </NavLink>
              <NavLink href="#/settings" active={route === 'settings'}>
                Settings
              </NavLink>
            </nav>
          </div>
          {route === 'overview' && (
            <RangeSwitcher
              preset={preset}
              custom={custom}
              today={today}
              onChange={(p, c) => {
                setPreset(p);
                if (c) setCustom(c);
              }}
            />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {route === 'settings' ? <Settings /> : <Overview range={range} today={today} />}
      </main>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-2.5 py-1 ${active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
    >
      {children}
    </a>
  );
}
