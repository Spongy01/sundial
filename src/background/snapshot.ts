import type { IdleState, Snapshot } from '../core/types';

/** Read the current focus / tab / idle truth from the browser. */
export async function takeSnapshot(idleThresholdSec: number): Promise<Snapshot> {
  const [win, idleState] = await Promise.all([
    chrome.windows.getLastFocused({ windowTypes: ['normal', 'popup'] }).catch(() => null),
    chrome.idle.queryState(Math.max(15, idleThresholdSec)) as Promise<IdleState>,
  ]);
  if (!win || win.id === undefined) return { window: null, tab: null, idleState };

  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return {
    window: { id: win.id, focused: win.focused, incognito: win.incognito },
    tab:
      tab && tab.id !== undefined
        ? { id: tab.id, url: tab.url, title: tab.title, audible: tab.audible ?? false }
        : null,
    idleState,
  };
}
