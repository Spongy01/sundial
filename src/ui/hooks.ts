import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { DailyAggregate, HourlyAggregate } from '../core/aggregate';
import type { CategoryInfo } from '../core/summary';
import { DEFAULT_SETTINGS, type OpenSession, type Settings } from '../core/types';
import { OPEN_SESSION_KEY } from '../background/openSession';
import { db, type Category } from '../data/db';
import { getSettings, onSettingsChanged } from '../data/settings';
import { localDateKey } from '../core/time';

/** Re-render every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Today's local date key; rolls over at midnight. */
export function useToday(): string {
  return localDateKey(useNow(30_000));
}

export function useCategories() {
  const list = useLiveQuery(() => db.categories.toArray(), []);
  return useMemo(() => {
    const all = list ?? [];
    const order = ['productive', 'entertainment', 'neutral'];
    const sorted = [...all].sort((a, b) => {
      const ai = a.builtin ? order.indexOf(a.id) : 50;
      const bi = b.builtin ? order.indexOf(b.id) : 50;
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      return ai - bi || a.name.localeCompare(b.name);
    });
    return {
      loaded: list !== undefined,
      list: sorted,
      map: new Map<string, Category>(sorted.map((c) => [c.id, c])),
      info: new Map<string, CategoryInfo>(sorted.map((c) => [c.id, c])),
    };
  }, [list]);
}

/** CSS color for a category. Built-ins use theme tokens so dark mode gets its own steps. */
export function categoryColor(cat: Pick<Category, 'id' | 'color' | 'builtin'> | undefined): string {
  if (!cat) return 'var(--cat-uncategorized)';
  return cat.builtin ? `var(--cat-${cat.id})` : cat.color;
}

export function useSettings(): [Settings, boolean] {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void getSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
    return onSettingsChanged(setS);
  }, []);
  return [s, loaded];
}

export function useOpenSession(): OpenSession | null {
  const [open, setOpen] = useState<OpenSession | null>(null);
  useEffect(() => {
    void chrome.storage.session.get(OPEN_SESSION_KEY).then((r) => setOpen((r[OPEN_SESSION_KEY] as OpenSession) ?? null));
    const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && OPEN_SESSION_KEY in changes) setOpen((changes[OPEN_SESSION_KEY]!.newValue as OpenSession) ?? null);
    };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);
  return open;
}

/**
 * Add the not-yet-flushed part of the open session (up to 30s) so totals tick
 * live between flushes.
 */
export function withLive<T extends DailyAggregate | HourlyAggregate>(
  rows: readonly T[] | undefined,
  open: OpenSession | null,
  now: number,
  range: { from: string; to: string },
  kind: 'daily' | 'hourly',
): T[] {
  const out = [...(rows ?? [])];
  if (!open) return out;
  const pending = now - open.flushedUntilTs;
  const date = localDateKey(now);
  if (pending <= 0 || pending > 5 * 60_000 || date < range.from || date > range.to) return out;
  const extra =
    kind === 'daily'
      ? { date, key: open.key, domain: open.domain, categoryId: open.categoryId, totalMs: pending }
      : { date, hour: new Date(now).getHours(), key: open.key, categoryId: open.categoryId, totalMs: pending };
  out.push(extra as T);
  return out;
}

export function useRange(from: string, to: string) {
  const daily = useLiveQuery(() => db.dailyAggregates.where('date').between(from, to, true, true).toArray(), [from, to]);
  const hourly = useLiveQuery(() => db.hourlyAggregates.where('date').between(from, to, true, true).toArray(), [from, to]);
  return { daily, hourly, loaded: daily !== undefined && hourly !== undefined };
}

export async function openDashboard(hash = ''): Promise<void> {
  const base = chrome.runtime.getURL('src/dashboard/index.html');
  const [existing] = await chrome.tabs.query({ url: `${base}*` });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, url: `${base}${hash}` });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: `${base}${hash}` });
  }
}

/** Ask the service worker to re-evaluate the current tab (e.g. after a rule change). */
export function nudgeTracker(): void {
  chrome.runtime.sendMessage({ type: 'reconcile' }).catch(() => {});
}
