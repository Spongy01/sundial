import { dailyId, hourlyId } from '../core/aggregate';
import { addDays } from '../core/time';
import { db as defaultDb, META_SESSIONS_FROM, type SundialDB } from './db';
import { DEFAULT_CATEGORIES, EXAMPLE_RULES } from './defaults/categories';

/**
 * Delete raw sessions older than `retentionDays` (0 = keep forever). Aggregates
 * are kept, so charts still cover the full history.
 */
export async function applyRetention(retentionDays: number, today: string, db: SundialDB = defaultDb): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0;
  const cutoff = addDays(today, -(retentionDays - 1));
  return db.transaction('rw', [db.sessions, db.meta], async () => {
    const removed = await db.sessions.where('date').below(cutoff).delete();
    const from = (await db.meta.get(META_SESSIONS_FROM))?.value as string | undefined;
    if (!from || from < cutoff) await db.meta.put({ key: META_SESSIONS_FROM, value: cutoff });
    return removed;
  });
}

/**
 * Delete a custom category. Its recorded time moves to `moveTo` (merging
 * aggregate rows) and rules that pointed at it are removed.
 */
export async function deleteCategory(id: string, moveTo = 'uncategorized', db: SundialDB = defaultDb): Promise<void> {
  const cat = await db.categories.get(id);
  if (!cat || cat.builtin) throw new Error('Built-in categories cannot be deleted');
  await db.transaction('rw', [db.categories, db.domainRules, db.sessions, db.dailyAggregates, db.hourlyAggregates], async () => {
    await db.sessions.toCollection().modify((s) => {
      if (s.categoryId === id) s.categoryId = moveTo;
    });
    const daily = await db.dailyAggregates.filter((a) => a.categoryId === id).toArray();
    for (const a of daily) {
      await db.dailyAggregates.delete([...dailyId(a)]);
      const next = { ...a, categoryId: moveTo };
      const cur = await db.dailyAggregates.get([...dailyId(next)]);
      await db.dailyAggregates.put({ ...next, totalMs: next.totalMs + (cur?.totalMs ?? 0) });
    }
    const hourly = await db.hourlyAggregates.filter((a) => a.categoryId === id).toArray();
    for (const a of hourly) {
      await db.hourlyAggregates.delete([...hourlyId(a)]);
      const next = { ...a, categoryId: moveTo };
      const cur = await db.hourlyAggregates.get([...hourlyId(next)]);
      await db.hourlyAggregates.put({ ...next, totalMs: next.totalMs + (cur?.totalMs ?? 0) });
    }
    await db.domainRules.filter((r) => r.categoryId === id).delete();
    await db.categories.delete(id);
  });
}

/** Erase everything and restore the defaults a fresh install would have. */
export async function wipeAllData(today: string, db: SundialDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
    await db.domainRules.bulkAdd(EXAMPLE_RULES);
    await db.meta.put({ key: META_SESSIONS_FROM, value: today });
  });
}
