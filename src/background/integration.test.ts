import { describe, expect, it } from 'vitest';
import { browser, focusTab } from '../../test/chromeMock';
import { DEFAULT_SETTINGS } from '../core/types';
import { META_SESSIONS_FROM, SundialDB } from '../data/db';
import { createRepo } from '../data/repo';
import { openSessionStore } from './openSession';
import { takeSnapshot } from './snapshot';
import { createTracker } from './tracker';

describe('tracker + Dexie + rules', () => {
  it('rolls a YouTube session over to Productive when the title turns into a tutorial', async () => {
    const repo = createRepo(new SundialDB('integration'));
    await repo.db.open();
    await repo.db.meta.put({ key: META_SESSIONS_FROM, value: '2026-01-01' });
    let clock = new Date(2026, 4, 1, 10).getTime();
    const t = createTracker({
      now: () => clock,
      settings: async () => DEFAULT_SETTINGS,
      snapshot: (s) => takeSnapshot(s.idleThresholdSec),
      categorizer: repo.getCategorizer,
      store: openSessionStore,
      sink: repo.sink,
    });

    focusTab('https://www.youtube.com/', { title: 'YouTube' });
    await t.reconcile('activated');
    clock += 60_000;
    // SPA navigation: URL then title change on the same tab.
    browser.tabs[0]!.url = 'https://www.youtube.com/watch?v=abc';
    browser.tabs[0]!.title = 'TypeScript Tutorial - YouTube';
    await t.reconcile('tab-updated');
    clock += 120_000;
    await t.reconcile('alarm');

    const daily = await repo.dailyRange('2026-05-01', '2026-05-01');
    expect(Object.fromEntries(daily.map((d) => [d.categoryId, d.totalMs]))).toEqual({
      entertainment: 60_000,
      productive: 120_000,
    });
    const sessions = await repo.db.sessions.toArray();
    expect(sessions.map((s) => s.ruleSource)).toEqual(['dictionary', 'keyword']);
    // Privacy: no URLs or titles are persisted anywhere.
    expect(JSON.stringify(sessions)).not.toMatch(/watch|Tutorial/);
  });
});
