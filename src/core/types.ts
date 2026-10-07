/** Shared domain types. Pure: nothing here may touch chrome.* or the DOM. */

export type IdleState = 'active' | 'idle' | 'locked';

export type CategoryKind = 'productive' | 'entertainment' | 'neutral' | 'uncategorized';

/** How a category was decided, in rules-engine priority order. */
export type RuleSource = 'keyword' | 'host' | 'domain' | 'dictionary' | 'none';

export interface Settings {
  /** Seconds of no input before the user counts as idle (chrome.idle, min 15). */
  idleThresholdSec: number;
  trackIncognito: boolean;
  /** Raw sessions older than this are deleted; aggregates are kept. */
  retentionDays: number;
  /** Registrable domains or hosts that are never tracked. */
  excludedDomains: string[];
  /** Registrable domains tracked per-subdomain (docs.google.com vs mail.google.com). */
  splitSubdomains: string[];
  paused: boolean;
  /** Rows roll over after this long so no single session row grows unbounded. */
  maxSessionMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdSec: 60,
  trackIncognito: false,
  retentionDays: 90,
  excludedDomains: [],
  splitSubdomains: ['google.com'],
  paused: false,
  maxSessionMs: 4 * 60 * 60 * 1000,
};

/** What the tracker can see of the browser at one instant. */
export interface Snapshot {
  window: { id: number; focused: boolean; incognito: boolean } | null;
  tab: { id: number; url?: string; title?: string; audible: boolean } | null;
  idleState: IdleState;
}

export interface Categorization {
  categoryId: string;
  ruleSource: RuleSource;
}

/** The site that *should* be accumulating time right now. */
export interface Target extends Categorization {
  key: string;
  domain: string;
  host: string;
  tabId: number;
  windowId: number;
}

/** The session currently accumulating time; lives in chrome.storage.session. */
export interface OpenSession extends Target {
  startTs: number;
  /** Everything before this instant has been persisted. */
  flushedUntilTs: number;
  /** Last time the tracker confirmed the session was still valid. Used to detect sleep. */
  lastHeartbeatTs: number;
  /** Persisted row for the current local day (sessions are split at midnight). */
  rowId?: number;
  rowDate: string;
  rowStartTs: number;
}

/** A persisted slice of a session: always within one local day. */
export interface Segment {
  session: OpenSession;
  /** Existing row to extend, or undefined to create one. */
  rowId: number | undefined;
  date: string;
  rowStartTs: number;
  fromTs: number;
  toTs: number;
}

export interface SessionSink {
  /** Persist [fromTs, toTs) onto the row (creating it if needed). Returns the row id. */
  writeSegment(seg: Segment): Promise<number>;
}
