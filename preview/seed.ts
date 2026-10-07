import { db } from '../src/data/db';
import { repo } from '../src/data/repo';
import type { OpenSession } from '../src/core/types';
import { localDateKey } from '../src/core/time';

const SITES: [string, string, number][] = [
  ['github.com', 'productive', 9], ['docs.google.com', 'productive', 5], ['stackoverflow.com', 'productive', 4],
  ['notion.so', 'productive', 3], ['claude.ai', 'productive', 4], ['youtube.com', 'entertainment', 7],
  ['reddit.com', 'entertainment', 4], ['x.com', 'entertainment', 3], ['netflix.com', 'entertainment', 2],
  ['nytimes.com', 'neutral', 2], ['mail.google.com', 'productive', 3], ['wikipedia.org', 'neutral', 2],
  ['tailwindcss.com', 'uncategorized', 2], ['vitest.dev', 'uncategorized', 1], ['dexie.org', 'uncategorized', 1],
];

/** Deterministic pseudo-random. */
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

export async function seed(empty: boolean) {
  await db.delete();
  await db.open();
  if (empty) return;
  const total = SITES.reduce((a, x) => a + x[2], 0);
  const pick = () => {
    let r = rnd() * total;
    for (const x of SITES) if ((r -= x[2]) <= 0) return x;
    return SITES[0]!;
  };
  const now = Date.now();
  for (let d = 30; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    let t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + Math.floor(rnd() * 2), Math.floor(rnd() * 60)).getTime();
    const end = Math.min(now - 60_000, new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 30).getTime());
    while (t < end) {
      const [key, cat] = pick();
      const hour = new Date(t).getHours();
      // Evenings and weekends drift toward entertainment.
      const [k, c] = (hour >= 19 || weekend) && cat === 'productive' && rnd() < 0.55 ? ['youtube.com', 'entertainment'] : [key, cat];
      const len = (3 + rnd() * (c === 'productive' ? 40 : 20)) * 60_000;
      const sess = { key: k, domain: k.replace(/^(docs|mail)\./, ''), host: k, categoryId: c, ruleSource: 'dictionary' } as OpenSession;
      await repo.writeSegment({ session: sess, rowId: undefined, date: localDateKey(t), rowStartTs: t, fromTs: t, toTs: Math.min(end, t + len) });
      t += len + (rnd() < 0.15 ? 60 + rnd() * 120 : rnd() * 4) * 60_000;
    }
  }
}
