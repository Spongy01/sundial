import type { DailyAggregate, HourlyAggregate } from '../core/aggregate';
import type { DomainRule } from '../core/rules';
import { DEFAULT_SETTINGS, type CategoryKind, type Settings } from '../core/types';
import { db as defaultDb, type Category, type MetaRow, type SessionRow, type SundialDB } from './db';

export const EXPORT_FORMAT = 'sundial-export';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  domainRules: DomainRule[];
  sessions: SessionRow[];
  dailyAggregates: DailyAggregate[];
  hourlyAggregates: HourlyAggregate[];
  meta: MetaRow[];
}

export async function exportAll(settings: Settings, db: SundialDB = defaultDb): Promise<ExportFile> {
  const [categories, domainRules, sessions, dailyAggregates, hourlyAggregates, meta] = await Promise.all([
    db.categories.toArray(),
    db.domainRules.toArray(),
    db.sessions.toArray(),
    db.dailyAggregates.toArray(),
    db.hourlyAggregates.toArray(),
    db.meta.toArray(),
  ]);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    categories,
    domainRules,
    sessions,
    dailyAggregates,
    hourlyAggregates,
    meta,
  };
}

// --- CSV -------------------------------------------------------------------

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  // Quote when needed; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function dailyCsv(rows: DailyAggregate[], cats: Map<string, Category>): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || b.totalMs - a.totalMs);
  return toCsv(
    ['date', 'site', 'domain', 'category', 'kind', 'minutes'],
    sorted.map((r) => {
      const c = cats.get(r.categoryId);
      return [r.date, r.key, r.domain, c?.name ?? r.categoryId, c?.kind ?? 'uncategorized', (r.totalMs / 60_000).toFixed(2)];
    }),
  );
}

export function sessionsCsv(rows: SessionRow[], cats: Map<string, Category>): string {
  const sorted = [...rows].sort((a, b) => a.startTs - b.startTs);
  return toCsv(
    ['date', 'start', 'end', 'site', 'host', 'category', 'seconds'],
    sorted.map((r) => [
      r.date,
      new Date(r.startTs).toISOString(),
      new Date(r.endTs).toISOString(),
      r.key,
      r.host,
      cats.get(r.categoryId)?.name ?? r.categoryId,
      Math.round(r.durationMs / 1000),
    ]),
  );
}

// --- Import ----------------------------------------------------------------

export class ImportError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const KINDS: CategoryKind[] = ['productive', 'entertainment', 'neutral', 'uncategorized'];

function arr<T>(file: Record<string, unknown>, key: string, check: (x: Record<string, unknown>) => boolean): T[] {
  const v = file[key] ?? [];
  if (!Array.isArray(v)) throw new ImportError(`"${key}" must be a list.`);
  v.forEach((row, i) => {
    if (!isObj(row) || !check(row)) throw new ImportError(`"${key}" row ${i + 1} is not valid.`);
  });
  return v as T[];
}

/** Validate untrusted JSON into an ExportFile. Throws ImportError with a readable message. */
export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  if (!isObj(raw) || raw.format !== EXPORT_FORMAT) throw new ImportError('This is not a Sundial export file.');
  if (!isNum(raw.version) || raw.version > EXPORT_VERSION) {
    throw new ImportError('This export was made by a newer version of Sundial. Update the extension and try again.');
  }

  const categories = arr<Category>(raw, 'categories', (c) => isStr(c.id) && isStr(c.name) && isStr(c.color) && KINDS.includes(c.kind as CategoryKind));
  const ids = new Set(categories.map((c) => c.id));
  for (const builtin of ['productive', 'entertainment', 'neutral', 'uncategorized']) {
    if (!ids.has(builtin)) throw new ImportError(`The built-in "${builtin}" category is missing.`);
  }
  const domainRules = arr<DomainRule>(
    raw,
    'domainRules',
    (r) => ['keyword', 'host', 'domain'].includes(r.type as string) && isStr(r.matchDomain) && isStr(r.categoryId) && isNum(r.priority),
  );
  const sessions = arr<SessionRow>(
    raw,
    'sessions',
    (s) => isDate(s.date) && isStr(s.key) && isStr(s.domain) && isStr(s.host) && isNum(s.startTs) && isNum(s.endTs) && s.endTs >= s.startTs && isStr(s.categoryId),
  );
  const dailyAggregates = arr<DailyAggregate>(
    raw,
    'dailyAggregates',
    (a) => isDate(a.date) && isStr(a.key) && isStr(a.domain) && isStr(a.categoryId) && isNum(a.totalMs) && a.totalMs >= 0,
  );
  const hourlyAggregates = arr<HourlyAggregate>(
    raw,
    'hourlyAggregates',
    (a) => isDate(a.date) && isNum(a.hour) && a.hour >= 0 && a.hour < 24 && isStr(a.key) && isStr(a.categoryId) && isNum(a.totalMs) && a.totalMs >= 0,
  );
  const meta = arr<MetaRow>(raw, 'meta', (m) => isStr(m.key));

  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(isNum(s.idleThresholdSec) && { idleThresholdSec: Math.min(3600, Math.max(15, s.idleThresholdSec)) }),
    ...(typeof s.trackIncognito === 'boolean' && { trackIncognito: s.trackIncognito }),
    ...(isNum(s.retentionDays) && { retentionDays: Math.max(0, s.retentionDays) }),
    ...(Array.isArray(s.excludedDomains) && { excludedDomains: s.excludedDomains.filter(isStr) }),
    ...(Array.isArray(s.splitSubdomains) && { splitSubdomains: s.splitSubdomains.filter(isStr) }),
  };

  return {
    format: EXPORT_FORMAT,
    version: raw.version,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    settings,
    categories,
    domainRules,
    sessions: sessions.map((x) => ({ ...x, durationMs: x.endTs - x.startTs, ruleSource: x.ruleSource ?? 'none' })),
    dailyAggregates,
    hourlyAggregates,
    meta,
  };
}

/** Replace all stored data with the contents of an export. */
export async function importAll(file: ExportFile, db: SundialDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.categories.bulkPut(file.categories.map((c) => ({ ...c, builtin: ['productive', 'entertainment', 'neutral', 'uncategorized'].includes(c.id) })));
    await db.domainRules.bulkPut(file.domainRules);
    await db.sessions.bulkPut(file.sessions);
    await db.dailyAggregates.bulkPut(file.dailyAggregates);
    await db.hourlyAggregates.bulkPut(file.hourlyAggregates);
    await db.meta.bulkPut(file.meta);
  });
}
