type L = (...a: any[]) => void;
const ev = () => {
  const ls: L[] = [];
  return { addListener: (l: L) => ls.push(l), removeListener: (l: L) => ls.splice(ls.indexOf(l), 1), fire: (...a: unknown[]) => ls.forEach((l) => l(...a)) };
};

export function installFakeChrome() {
  const onChanged = ev();
  const area = (name: string, init: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...init };
    return {
      async get(k: string) {
        return k in data ? { [k]: data[k] } : {};
      },
      async set(items: Record<string, unknown>) {
        const ch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(items)) {
          ch[k] = { oldValue: data[k], newValue: v };
          data[k] = v;
        }
        onChanged.fire(ch, name);
      },
      async remove(k: string) {
        delete data[k];
      },
      async clear() {},
    };
  };
  const now = Date.now();
  (globalThis as any).chrome = {
    runtime: { getURL: (p: string) => `/nofavicon${p}`, sendMessage: async () => {}, onMessage: ev() },
    storage: {
      onChanged,
      local: area('local'),
      session: area('session', {
        openSession: {
          key: 'github.com', domain: 'github.com', host: 'github.com', categoryId: 'productive', ruleSource: 'dictionary',
          tabId: 1, windowId: 1, startTs: now - 754_000, flushedUntilTs: now - 12_000, lastHeartbeatTs: now - 12_000,
          rowDate: '', rowStartTs: now - 754_000,
        },
      }),
    },
    tabs: { query: async () => [], create: async () => {}, update: async () => {} },
    windows: { update: async () => {} },
  };
}
