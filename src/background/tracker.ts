import { computeDesiredTarget, sameTarget, type Categorizer } from '../core/eligibility';
import { localDateKey, splitAtMidnight } from '../core/time';
import type { OpenSession, SessionSink, Settings, Snapshot, Target } from '../core/types';

export type { Segment, SessionSink } from '../core/types';
import type { OpenSessionStore } from './openSession';

/** Alarm period. Chrome < 120 clamps this to 1 minute, which GAP_MS tolerates. */
export const FLUSH_INTERVAL_MS = 30_000;
/**
 * If the tracker has not heard from the browser for this long, the machine was
 * asleep (alarms don't fire) or the browser froze. The gap is discarded.
 */
export const GAP_MS = 150_000;
/** Sessions shorter than this that never got persisted are dropped as noise. */
export const MIN_SESSION_MS = 1_000;

export interface TrackerDeps {
  now(): number;
  settings(): Promise<Settings>;
  snapshot(settings: Settings): Promise<Snapshot>;
  categorizer(): Promise<Categorizer>;
  store: OpenSessionStore;
  sink: SessionSink;
  log?: (msg: string, ...rest: unknown[]) => void;
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function createTracker(deps: TrackerDeps) {
  const { store, sink } = deps;
  const log = deps.log ?? (() => {});

  // Serialize all work: chrome events can arrive concurrently and each one
  // reads-then-writes the open session.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = chain.then(fn);
    chain = p.catch((err) => console.error('[sundial] tracker error', err));
    return p;
  }

  /** Persist everything up to `toTs`, splitting rows at local midnight. */
  async function persist(open: OpenSession, toTs: number): Promise<OpenSession> {
    const s = { ...open };
    if (toTs <= s.flushedUntilTs) return s;
    for (const slice of splitAtMidnight(s.flushedUntilTs, toTs)) {
      if (slice.date !== s.rowDate) {
        s.rowId = undefined;
        s.rowDate = slice.date;
        s.rowStartTs = slice.startTs;
      }
      s.rowId = await sink.writeSegment({
        session: s,
        rowId: s.rowId,
        date: slice.date,
        rowStartTs: s.rowStartTs,
        fromTs: slice.startTs,
        toTs: slice.endTs,
      });
      s.flushedUntilTs = slice.endTs;
    }
    return s;
  }

  async function closeAt(open: OpenSession, endTs: number, why: string): Promise<void> {
    const end = Math.max(endTs, open.flushedUntilTs);
    if (open.rowId === undefined && end - open.startTs < MIN_SESSION_MS) {
      log(`drop ${open.key} (${fmt(end - open.startTs)}, ${why})`);
    } else {
      await persist(open, end);
      log(`close ${open.key} ${fmt(end - open.startTs)} (${why})`);
    }
    await store.clear();
  }

  function openFrom(t: Target, now: number): OpenSession {
    return { ...t, startTs: now, flushedUntilTs: now, lastHeartbeatTs: now, rowDate: localDateKey(now), rowStartTs: now };
  }

  async function reconcileNow(reason: string): Promise<void> {
    const settings = await deps.settings();
    const now = deps.now();
    let open = await store.get();

    if (open && now - open.lastHeartbeatTs > GAP_MS) {
      await closeAt(open, open.lastHeartbeatTs, `gap ${fmt(now - open.lastHeartbeatTs)} discarded`);
      open = null;
    }

    const snap = await deps.snapshot(settings);
    const decision = computeDesiredTarget(snap, settings, await deps.categorizer());

    if (open && decision.target && sameTarget(open, decision.target)) {
      const s = await persist(open, now);
      s.lastHeartbeatTs = now;
      s.tabId = decision.target.tabId;
      s.windowId = decision.target.windowId;
      if (now - s.rowStartTs >= settings.maxSessionMs) {
        // Roll over to a fresh row so no single row grows unbounded.
        s.rowId = undefined;
        s.rowStartTs = now;
        s.rowDate = localDateKey(now);
      }
      await store.set(s);
      return;
    }

    if (open) await closeAt(open, now, reason);

    if (decision.target) {
      await store.set(openFrom(decision.target, now));
      log(`open ${decision.target.key} [${decision.target.categoryId}] (${reason})`);
    } else if (open) {
      log(`idle: ${decision.reason}`);
    }
  }

  return {
    /** Bring the open session in line with the browser's current state. */
    reconcile: (reason: string) => serial(() => reconcileNow(reason)),
    /**
     * Browser startup: a session left over from before is stale. Its time up to
     * the last heartbeat is already persisted, so close it there.
     */
    recover: () =>
      serial(async () => {
        const open = await store.get();
        if (open) await closeAt(open, open.lastHeartbeatTs, 'stale on startup');
      }),
    /** Close whatever is open right now (e.g. before wiping data). */
    closeNow: (why: string) =>
      serial(async () => {
        const open = await store.get();
        if (open) await closeAt(open, deps.now(), why);
      }),
  };
}

export type Tracker = ReturnType<typeof createTracker>;
