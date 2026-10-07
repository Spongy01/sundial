import type { OpenSession } from '../core/types';

const KEY = 'openSession';

/**
 * The in-progress session lives in chrome.storage.session, never in module
 * state: MV3 service workers can be terminated between any two events.
 */
export const openSessionStore = {
  async get(): Promise<OpenSession | null> {
    const res = await chrome.storage.session.get(KEY);
    return (res[KEY] as OpenSession | undefined) ?? null;
  },
  async set(s: OpenSession): Promise<void> {
    await chrome.storage.session.set({ [KEY]: s });
  },
  async clear(): Promise<void> {
    await chrome.storage.session.remove(KEY);
  },
};

export type OpenSessionStore = typeof openSessionStore;
export const OPEN_SESSION_KEY = KEY;
