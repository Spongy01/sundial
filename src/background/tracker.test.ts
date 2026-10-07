import { beforeEach, describe, expect, it } from 'vitest';
import { browser, focusTab } from '../../test/chromeMock';
import { UNCATEGORIZED } from '../core/eligibility';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import { openSessionStore } from './openSession';
import { takeSnapshot } from './snapshot';
import { createTracker, GAP_MS, type Segment } from './tracker';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

let clock = 0;
let segments: Segment[] = [];
let settings: Settings = DEFAULT_SETTINGS;

function makeTracker() {
  return createTracker({
    now: () => clock,
    settings: async () => settings,
    snapshot: (s) => takeSnapshot(s.idleThresholdSec),
    categorizer: async () => UNCATEGORIZED,
    store: openSessionStore,
    sink: {
      async writeSegment(seg) {
        segments.push(structuredClone(seg));
        return seg.rowId ?? segments.length;
      },
    },
  });
}

/** Total persisted ms per tracking key. */
const totals = () =>
  segments.reduce<Record<string, number>>((acc, s) => {
    acc[s.session.key] = (acc[s.session.key] ?? 0) + (s.toTs - s.fromTs);
    return acc;
  }, {});

beforeEach(() => {
  clock = at(2026, 5, 1, 10);
  segments = [];
  settings = DEFAULT_SETTINGS;
});

describe('tracker', () => {
  it('opens on a web tab and attributes time when switching sites', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += 20_000;
    focusTab('https://www.youtube.com/');
    await t.reconcile('activated');
    clock += 5_000;
    await t.reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': 20_000, 'youtube.com': 5_000 });
  });

  it('flushes incrementally on each alarm without double counting', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    for (let i = 0; i < 4; i++) {
      clock += 30_000;
      await t.reconcile('alarm');
    }
    expect(totals()).toEqual({ 'github.com': 120_000 });
    // All flushes extend one row.
    expect(new Set(segments.map((s) => s.rowId ?? 1)).size).toBe(1);
    expect((await openSessionStore.get())?.flushedUntilTs).toBe(clock);
  });

  it('stops counting when the window loses focus', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += 10_000;
    browser.windows[0]!.focused = false;
    await t.reconcile('focus-changed');
    clock += 60_000;
    await t.reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': 10_000 });
    expect(await openSessionStore.get()).toBeNull();
  });

  describe('idle', () => {
    it('closes the session when the user goes idle on a silent tab', async () => {
      const t = makeTracker();
      focusTab('https://github.com/');
      await t.reconcile('activated');
      clock += 90_000;
      browser.idleState = 'idle';
      await t.reconcile('idle-idle');
      clock += 300_000;
      await t.reconcile('alarm');
      expect(totals()).toEqual({ 'github.com': 90_000 });
    });

    it('keeps counting while idle when the tab is audible, and stops once audio ends', async () => {
      const t = makeTracker();
      focusTab('https://www.youtube.com/watch?v=1', { audible: true });
      await t.reconcile('activated');
      browser.idleState = 'idle';
      for (let i = 0; i < 10; i++) {
        clock += 30_000;
        await t.reconcile(i === 0 ? 'idle-idle' : 'alarm');
      }
      browser.tabs[0]!.audible = false;
      await t.reconcile('tab-updated');
      clock += 120_000;
      await t.reconcile('alarm');
      expect(totals()).toEqual({ 'youtube.com': 300_000 });
    });

    it('resumes on return from idle', async () => {
      const t = makeTracker();
      focusTab('https://github.com/');
      browser.idleState = 'idle';
      await t.reconcile('idle-idle');
      expect(await openSessionStore.get()).toBeNull();
      browser.idleState = 'active';
      await t.reconcile('idle-active');
      expect((await openSessionStore.get())?.key).toBe('github.com');
    });
  });

  it('splits a session that spans midnight into two rows on two dates', async () => {
    clock = at(2026, 5, 1, 23, 59, 0);
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock = at(2026, 5, 2, 0, 0, 30);
    await t.reconcile('alarm');
    expect(segments.map((s) => [s.date, s.toTs - s.fromTs])).toEqual([
      ['2026-05-01', 60_000],
      ['2026-05-02', 30_000],
    ]);
    expect(segments[1]!.rowId).toBeUndefined(); // new row for the new day
    expect(segments[1]!.rowStartTs).toBe(at(2026, 5, 2));
  });

  it('discards the gap after sleep instead of logging a huge session', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += 30_000;
    await t.reconcile('alarm');
    clock += 8 * 3_600_000; // laptop lid closed overnight; no alarms fired
    await t.reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': 30_000 });
    // ...and tracking resumes cleanly with a new session.
    expect((await openSessionStore.get())?.startTs).toBe(clock);
  });

  it('tolerates a slow alarm below the gap threshold', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += GAP_MS - 1;
    await t.reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': GAP_MS - 1 });
  });

  it('recovers a stale session on startup by closing it at its last heartbeat', async () => {
    const t1 = makeTracker();
    focusTab('https://github.com/');
    await t1.reconcile('activated');
    clock += 30_000;
    await t1.reconcile('alarm');
    // Worker dies; the browser restarts much later. A brand-new tracker instance:
    clock += 3_600_000;
    const t2 = makeTracker();
    await t2.recover();
    expect(await openSessionStore.get()).toBeNull();
    expect(totals()).toEqual({ 'github.com': 30_000 });
  });

  it('survives a worker restart mid-session because state is in storage.session', async () => {
    focusTab('https://github.com/');
    await makeTracker().reconcile('activated');
    clock += 30_000;
    await makeTracker().reconcile('alarm'); // fresh instance, no in-memory state
    clock += 30_000;
    await makeTracker().reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': 60_000 });
  });

  it('rolls over to a new row once maxSessionMs is reached', async () => {
    settings = { ...DEFAULT_SETTINGS, maxSessionMs: 60_000 };
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    for (let i = 0; i < 4; i++) {
      clock += 30_000;
      await t.reconcile('alarm');
    }
    expect(totals()).toEqual({ 'github.com': 120_000 });
    expect(segments.filter((s) => s.rowId === undefined)).toHaveLength(2);
  });

  it('drops sub-second blips', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += 300;
    focusTab('chrome://newtab/');
    await t.reconcile('activated');
    expect(segments).toEqual([]);
  });

  it('serializes concurrent events', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await Promise.all([t.reconcile('a'), t.reconcile('b'), t.reconcile('c')]);
    clock += 10_000;
    await Promise.all([t.reconcile('d'), t.reconcile('e')]);
    expect(totals()).toEqual({ 'github.com': 10_000 });
  });

  it('stops immediately when paused', async () => {
    const t = makeTracker();
    focusTab('https://github.com/');
    await t.reconcile('activated');
    clock += 5_000;
    settings = { ...DEFAULT_SETTINGS, paused: true };
    await t.reconcile('settings');
    clock += 60_000;
    await t.reconcile('alarm');
    expect(totals()).toEqual({ 'github.com': 5_000 });
  });
});
