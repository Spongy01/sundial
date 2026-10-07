import Dexie, { type Table } from 'dexie';
import type { DailyAggregate, HourlyAggregate } from '../core/aggregate';
import type { DomainRule } from '../core/rules';
import { localDateKey } from '../core/time';
import type { RuleSource } from '../core/types';
import { DEFAULT_CATEGORIES, EXAMPLE_RULES, type Category } from './defaults/categories';

export type { Category, DailyAggregate, DomainRule, HourlyAggregate };

/** One continuous active period on one site, within one local day. */
export interface SessionRow {
  id?: number;
  date: string;
  domain: string;
  /** Subdomain-level host, e.g. docs.google.com. */
  host: string;
  /** Aggregation key: domain, or host for split domains. */
  key: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  /** Category at time of logging. */
  categoryId: string;
  ruleSource: RuleSource;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Earliest local date for which raw sessions are complete. Aggregates for dates
 * on/after this can be rebuilt from sessions; older ones can only be relabelled.
 */
export const META_SESSIONS_FROM = 'sessionsCoverFrom';

export class SundialDB extends Dexie {
  sessions!: Table<SessionRow, number>;
  dailyAggregates!: Table<DailyAggregate, [string, string, string]>;
  hourlyAggregates!: Table<HourlyAggregate, [string, number, string, string]>;
  categories!: Table<Category, string>;
  domainRules!: Table<DomainRule, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'sundial') {
    super(name);
    this.version(1).stores({
      sessions: '++id, date, startTs, key, [date+key]',
      dailyAggregates: '[date+key+categoryId], date, key',
      hourlyAggregates: '[date+hour+key+categoryId], date, key',
      categories: 'id, kind',
      domainRules: '++id, type, matchDomain',
      meta: 'key',
    });
    this.on('populate', (tx) => {
      void tx.table('categories').bulkAdd(DEFAULT_CATEGORIES);
      void tx.table('domainRules').bulkAdd(EXAMPLE_RULES);
      void tx.table('meta').add({ key: META_SESSIONS_FROM, value: localDateKey(Date.now()) });
    });
  }
}

export const db = new SundialDB();
