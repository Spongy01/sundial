import { describe, expect, it } from 'vitest';
import { computeDesiredTarget } from './eligibility';
import { DEFAULT_SETTINGS, type Snapshot } from './types';

const snap = (over: Partial<Snapshot> & { url?: string; audible?: boolean } = {}): Snapshot => ({
  window: { id: 1, focused: true, incognito: false },
  tab: { id: 7, url: over.url ?? 'https://github.com/x', title: 'x', audible: over.audible ?? false },
  idleState: 'active',
  ...over,
});
const decide = (s: Snapshot, settings = DEFAULT_SETTINGS) => computeDesiredTarget(s, settings);

describe('computeDesiredTarget', () => {
  it('tracks the active tab of a focused window', () => {
    expect(decide(snap()).target).toMatchObject({ key: 'github.com', tabId: 7, windowId: 1 });
  });

  it('stops when the browser window loses focus, even if audible (strict focus)', () => {
    const s = snap({ audible: true });
    s.window!.focused = false;
    expect(decide(s)).toEqual({ target: null, reason: 'unfocused' });
  });

  it('stops when there is no window at all', () => {
    expect(decide(snap({ window: null }))).toEqual({ target: null, reason: 'no-window' });
  });

  describe('idle handling', () => {
    it('stops counting when idle and the tab is silent', () => {
      expect(decide(snap({ idleState: 'idle' }))).toEqual({ target: null, reason: 'idle' });
    });

    it('keeps counting when idle but the tab is audible (watching a video)', () => {
      expect(decide(snap({ idleState: 'idle', audible: true, url: 'https://youtube.com/watch' })).target?.key).toBe(
        'youtube.com',
      );
    });

    it('always stops when the screen is locked, even with audio', () => {
      expect(decide(snap({ idleState: 'locked', audible: true }))).toEqual({ target: null, reason: 'locked' });
    });
  });

  it('ignores non-web pages', () => {
    expect(decide(snap({ url: 'chrome://newtab/' }))).toEqual({ target: null, reason: 'not-web' });
  });

  it('ignores incognito unless enabled', () => {
    const s = snap();
    s.window!.incognito = true;
    expect(decide(s)).toEqual({ target: null, reason: 'incognito' });
    expect(decide(s, { ...DEFAULT_SETTINGS, trackIncognito: true }).target?.key).toBe('github.com');
  });

  it('honours pause and excluded domains', () => {
    expect(decide(snap(), { ...DEFAULT_SETTINGS, paused: true })).toEqual({ target: null, reason: 'paused' });
    expect(decide(snap({ url: 'https://gist.github.com/' }), { ...DEFAULT_SETTINGS, excludedDomains: ['github.com'] })).toEqual({
      target: null,
      reason: 'excluded',
    });
  });

  it('passes the parsed site and title to the categorizer', () => {
    const d = computeDesiredTarget(snap({ url: 'https://youtube.com/watch' }), DEFAULT_SETTINGS, (i) => ({
      categoryId: i.title === 'x' && i.domain === 'youtube.com' ? 'productive' : 'nope',
      ruleSource: 'keyword',
    }));
    expect(d.target).toMatchObject({ categoryId: 'productive', ruleSource: 'keyword' });
  });
});
