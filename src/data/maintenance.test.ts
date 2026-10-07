import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/types';
import { META_SESSIONS_FROM, SundialDB } from './db';
import { dailyCsv, exportAll, importAll, ImportError, parseExport, toCsv } from './exportImport';
import { applyRetention, deleteCategory, wipeAllData } from './maintenance';
import { createRepo, type Repo } from './repo';

let repo: Repo;
let n = 0;
const at = (y: number, mo: number, d: number, h = 0) => new Date(y, mo - 1, d, h).getTime();

async function addSession(key: string, categoryId: string, y: number, mo: number, d: number) {
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  await repo.writeSegment({
    session: { key, domain: key, host: key, categoryId, ruleSource: 'domain' } as never,
    rowId: undefined,
    date,
    rowStartTs: at(y, mo, d, 10),
    fromTs: at(y, mo, d, 10),
    toTs: at(y, mo, d, 11),
  });
}

beforeEach(async () => {
  repo = createRepo(new SundialDB(`maint-${n++}`));
  await repo.db.open();
  await repo.db.meta.put({ key: META_SESSIONS_FROM, value: '2026-01-01' });
});

describe('retention', () => {
  it('deletes old raw sessions but keeps aggregates and moves the coverage window', async () => {
    await addSession('a.com', 'productive', 2026, 3, 1);
    await addSession('a.com', 'productive', 2026, 5, 9);
    const removed = await applyRetention(14, '2026-05-10', repo.db);
    expect(removed).toBe(1);
    expect((await repo.db.sessions.toArray()).map((s) => s.date)).toEqual(['2026-05-09']);
    expect(await repo.db.dailyAggregates.count()).toBe(2);
    expect((await repo.db.meta.get(META_SESSIONS_FROM))?.value).toBe('2026-04-27');
  });

  it('keeps everything when retention is 0 (forever)', async () => {
    await addSession('a.com', 'productive', 2020, 1, 1);
    expect(await applyRetention(0, '2026-05-10', repo.db)).toBe(0);
    expect(await repo.db.sessions.count()).toBe(1);
  });
});

describe('deleteCategory', () => {
  it('moves time to the target, merging aggregate rows, and drops its rules', async () => {
    await repo.db.categories.add({ id: 'learn', name: 'Learning', color: '#123456', kind: 'productive', builtin: false });
    await repo.db.domainRules.add({ type: 'domain', matchDomain: 'a.com', categoryId: 'learn', priority: 0, enabled: true });
    await addSession('a.com', 'learn', 2026, 5, 1);
    await addSession('a.com', 'uncategorized', 2026, 5, 1);
    await deleteCategory('learn', 'uncategorized', repo.db);
    expect(await repo.db.categories.get('learn')).toBeUndefined();
    expect(await repo.db.domainRules.where('matchDomain').equals('a.com').count()).toBe(0);
    expect(await repo.db.dailyAggregates.toArray()).toEqual([
      expect.objectContaining({ categoryId: 'uncategorized', totalMs: 2 * 3_600_000 }),
    ]);
    expect((await repo.db.sessions.toArray()).every((s) => s.categoryId === 'uncategorized')).toBe(true);
  });

  it('refuses to delete built-ins', async () => {
    await expect(deleteCategory('productive', 'uncategorized', repo.db)).rejects.toThrow();
  });
});

describe('export / import', () => {
  it('round-trips all data', async () => {
    await addSession('a.com', 'productive', 2026, 5, 1);
    const file = await exportAll({ ...DEFAULT_SETTINGS, idleThresholdSec: 120 }, repo.db);
    const parsed = parseExport(JSON.stringify(file));
    const other = new SundialDB(`maint-other-${n++}`);
    await other.open();
    await importAll(parsed, other);
    expect(await other.sessions.count()).toBe(1);
    expect(await other.dailyAggregates.toArray()).toEqual(await repo.db.dailyAggregates.toArray());
    expect(parsed.settings.idleThresholdSec).toBe(120);
  });

  it('rejects files that are not Sundial exports, with a readable reason', () => {
    expect(() => parseExport('nope')).toThrow(ImportError);
    expect(() => parseExport('{"format":"other"}')).toThrow('not a Sundial export');
    expect(() => parseExport(JSON.stringify({ format: 'sundial-export', version: 99 }))).toThrow('newer version');
  });

  it('rejects malformed rows', async () => {
    const file = await exportAll(DEFAULT_SETTINGS, repo.db);
    const bad = { ...file, sessions: [{ date: 'yesterday', key: 1 }] };
    expect(() => parseExport(JSON.stringify(bad))).toThrow('"sessions" row 1');
  });
});

describe('csv', () => {
  it('quotes and neutralises formula injection', () => {
    expect(toCsv(['a', 'b'], [['=1+1', 'x,"y"']])).toBe('a,b\r\n\'=1+1,"x,""y"""\r\n');
  });

  it('exports daily totals with category names and minutes', async () => {
    await addSession('a.com', 'productive', 2026, 5, 1);
    const cats = new Map((await repo.db.categories.toArray()).map((c) => [c.id, c]));
    expect(dailyCsv(await repo.db.dailyAggregates.toArray(), cats)).toBe(
      'date,site,domain,category,kind,minutes\r\n2026-05-01,a.com,a.com,Productive,productive,60.00\r\n',
    );
  });
});

describe('wipeAllData', () => {
  it('erases data and restores defaults', async () => {
    await addSession('a.com', 'productive', 2026, 5, 1);
    await wipeAllData('2026-05-10', repo.db);
    expect(await repo.db.sessions.count()).toBe(0);
    expect(await repo.db.dailyAggregates.count()).toBe(0);
    expect(await repo.db.categories.count()).toBe(4);
    expect(await repo.db.domainRules.count()).toBe(1);
  });
});
