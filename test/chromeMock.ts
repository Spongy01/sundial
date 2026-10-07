/**
 * Minimal in-memory fake of the chrome.* APIs Sundial uses. Tests mutate the
 * `browser` state directly, then call the code under test.
 */

type Listener = (...args: any[]) => unknown;

export class FakeEvent {
  listeners: Listener[] = [];
  addListener = (l: Listener) => void this.listeners.push(l);
  removeListener = (l: Listener) => {
    this.listeners = this.listeners.filter((x) => x !== l);
  };
  hasListener = (l: Listener) => this.listeners.includes(l);
  dispatch(...args: unknown[]) {
    for (const l of this.listeners) l(...args);
  }
}

function storageArea(name: string, onChanged: FakeEvent) {
  let data: Record<string, unknown> = {};
  const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  return {
    _dump: () => data,
    _reset: () => {
      data = {};
    },
    async get(keys?: string | string[] | null) {
      if (keys == null) return clone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = clone(data[k]);
      return out;
    },
    async set(items: Record<string, unknown>) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: clone(v) };
        data[k] = clone(v);
      }
      onChanged.dispatch(changes, name);
    },
    async remove(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
    async clear() {
      data = {};
    },
  };
}

export interface FakeWindow {
  id: number;
  focused: boolean;
  incognito: boolean;
}
export interface FakeTab {
  id: number;
  windowId: number;
  active: boolean;
  url?: string;
  title?: string;
  audible?: boolean;
}

export const browser = {
  windows: [] as FakeWindow[],
  tabs: [] as FakeTab[],
  lastFocusedWindowId: null as number | null,
  idleState: 'active' as 'active' | 'idle' | 'locked',
};

export function installChromeMock() {
  const storageChanged = new FakeEvent();
  const alarms = new Map<string, { name: string; periodInMinutes?: number }>();
  const chromeMock = {
    storage: {
      onChanged: storageChanged,
      local: storageArea('local', storageChanged),
      session: storageArea('session', storageChanged),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: new FakeEvent(),
      async getLastFocused() {
        const w = browser.windows.find((x) => x.id === browser.lastFocusedWindowId);
        if (!w) throw new Error('No last-focused window');
        return { ...w };
      },
    },
    tabs: {
      onActivated: new FakeEvent(),
      onUpdated: new FakeEvent(),
      onRemoved: new FakeEvent(),
      async query(q: { active?: boolean; windowId?: number }) {
        return browser.tabs
          .filter((t) => (q.active === undefined || t.active === q.active) && (q.windowId === undefined || t.windowId === q.windowId))
          .map((t) => ({ ...t }));
      },
    },
    idle: {
      onStateChanged: new FakeEvent(),
      setDetectionInterval: () => {},
      async queryState() {
        return browser.idleState;
      },
    },
    alarms: {
      onAlarm: new FakeEvent(),
      async get(name: string) {
        return alarms.get(name);
      },
      async create(name: string, info: { periodInMinutes?: number }) {
        alarms.set(name, { name, ...info });
      },
    },
    runtime: {
      onStartup: new FakeEvent(),
      onInstalled: new FakeEvent(),
    },
  };
  (globalThis as any).chrome = chromeMock;
  return chromeMock;
}

export function resetBrowser() {
  browser.windows = [];
  browser.tabs = [];
  browser.lastFocusedWindowId = null;
  browser.idleState = 'active';
  const c = (globalThis as any).chrome;
  c?.storage.local._reset();
  c?.storage.session._reset();
}

/** Convenience: one focused normal window with one active tab. */
export function focusTab(url: string, opts: Partial<FakeTab> & { incognito?: boolean } = {}) {
  const { incognito = false, ...tabOpts } = opts;
  browser.windows = [{ id: 1, focused: true, incognito }];
  browser.lastFocusedWindowId = 1;
  browser.tabs = [{ id: 10, windowId: 1, active: true, url, title: '', audible: false, ...tabOpts }];
}
