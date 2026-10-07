import { hostMatches, parseSite, trackingKey, type ParsedSite } from './domain';
import type { Categorization, Settings, Snapshot, Target } from './types';

export type Categorizer = (input: ParsedSite & { title: string }) => Categorization;

export const UNCATEGORIZED: Categorizer = () => ({ categoryId: 'uncategorized', ruleSource: 'none' });

export type SkipReason =
  | 'paused'
  | 'no-window'
  | 'unfocused'
  | 'incognito'
  | 'no-tab'
  | 'locked'
  | 'idle'
  | 'not-web'
  | 'excluded';

export type Decision = { target: Target } | { target: null; reason: SkipReason };

/**
 * Decide what (if anything) should be accumulating time, given a snapshot.
 * Time counts only when every condition holds:
 *  - tracking not paused
 *  - the window is OS-focused (strict: an unfocused window never counts)
 *  - the window is not incognito, unless enabled
 *  - the user is active, OR idle while the tab is audible (locked always stops)
 *  - the URL is http(s) and not excluded
 */
export function computeDesiredTarget(
  snap: Snapshot,
  settings: Settings,
  categorize: Categorizer = UNCATEGORIZED,
): Decision {
  if (settings.paused) return { target: null, reason: 'paused' };
  const { window: win, tab } = snap;
  if (!win) return { target: null, reason: 'no-window' };
  if (!win.focused) return { target: null, reason: 'unfocused' };
  if (win.incognito && !settings.trackIncognito) return { target: null, reason: 'incognito' };
  if (!tab) return { target: null, reason: 'no-tab' };
  if (snap.idleState === 'locked') return { target: null, reason: 'locked' };
  if (snap.idleState === 'idle' && !tab.audible) return { target: null, reason: 'idle' };

  const site = parseSite(tab.url);
  if (!site) return { target: null, reason: 'not-web' };
  if (settings.excludedDomains.some((p) => hostMatches(site.host, p))) {
    return { target: null, reason: 'excluded' };
  }

  const cat = categorize({ ...site, title: tab.title ?? '' });
  return {
    target: {
      key: trackingKey(site, settings.splitSubdomains),
      domain: site.domain,
      host: site.host,
      tabId: tab.id,
      windowId: win.id,
      categoryId: cat.categoryId,
      ruleSource: cat.ruleSource,
    },
  };
}

/** Same site, same category: the open session can simply continue. */
export function sameTarget(a: Target, b: Target): boolean {
  return a.key === b.key && a.categoryId === b.categoryId && a.host === b.host;
}
