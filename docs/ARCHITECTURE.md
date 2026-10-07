# Sundial architecture

```
 chrome events ─┐
 (tabs, windows,│      ┌──────────── service worker ─────────────┐
  idle, alarms, ├────► │ reconcile()  ← one serialized entry point │
  messages)     │      │   1. snapshot: focused window, active tab, │
 settings ──────┘      │      idle state         (background/)     │
                       │   2. computeDesiredTarget()  (core/, pure) │
                       │   3. same target? flush : close + open     │
                       └──────┬──────────────────────┬─────────────┘
                              │                      │
             chrome.storage.session            IndexedDB (Dexie)
             OpenSession (survives             sessions, dailyAggregates,
             worker restarts)                  hourlyAggregates, categories,
                              ▲                domainRules, meta
                              │                      ▲
                       ┌──────┴──────────────────────┴──────┐
                       │ popup / dashboard (React)           │
                       │ live queries + not-yet-flushed time │
                       └─────────────────────────────────────┘
```

## Layers

| Folder | Role | Depends on |
|---|---|---|
| `src/core/` | Pure logic with no `chrome.*` or DOM: time splitting, domain normalization, eligibility, rules engine, aggregation, summaries, insights. Fully unit-tested. | `tldts` |
| `src/background/` | Service worker: event wiring (`index.ts`), the tracker state machine (`tracker.ts`), the browser snapshot, and the open-session store. | core, data |
| `src/data/` | Dexie schema, the sink that persists tracked time, re-categorization, retention, and export/import. | core |
| `src/ui/` | Shared React pieces: theme tokens, hooks, chips, the day dial. | core, data |
| `src/popup/`, `src/dashboard/` | The two extension pages. | ui, data, core |

## Tracking: one reconcile, no per-event logic

Every event (tab activated or updated, window focus, idle state, alarm, settings change, UI nudge) calls `tracker.reconcile(reason)`. It reads the **current truth** from the browser and compares it with the stored open session. It never derives state from the event itself, so event order and duplicate events don't matter, and a missed event is corrected at the next 30-second alarm. Calls go through a promise queue, so two events can't interleave their read-modify-write.

`computeDesiredTarget(snapshot, settings, categorize)` decides whether time should count. It returns nothing when:

- tracking is paused
- the window isn't focused, or is incognito and incognito isn't enabled
- the screen is locked, or the user is idle and the tab is silent
- the page isn't http(s), or the site is excluded

Otherwise it returns `{key, domain, host, categoryId}`. If the key or category changed, the old session is closed and a new one opened. This is how a YouTube SPA navigation to a "Tutorial" title switches the session to Productive mid-visit.

### Crash and sleep safety

MV3 service workers can be stopped at any moment, so nothing lives in module state.

- **OpenSession** is kept in `chrome.storage.session`. It holds the key, category, `startTs`, `flushedUntilTs`, `lastHeartbeatTs`, and the current row id.
- **Incremental flush:** each reconcile writes `[flushedUntilTs, now)` to IndexedDB in one transaction. That transaction extends the session row and adds the delta to the daily and hourly aggregates. The write is idempotent: the row's `endTs` guards against counting a retried segment twice. Durable data is never more than one flush behind.
- **Sleep:** alarms don't fire while the machine sleeps. If more than 150 seconds have passed since the last heartbeat, the session closes at that heartbeat and the gap is discarded.
- **Startup:** `storage.session` is cleared when the browser quits. Any session left over is closed at its last heartbeat; its time is already persisted.
- **Midnight:** every flush is split with `splitAtMidnight()`, and a new row starts each local day. Hours use `splitByHour()`. Both build boundaries from local `Date` constructors, so 23- and 25-hour DST days are correct.
- **Row cap:** a session row rolls over after `maxSessionMs` (4 hours by default), so no single row grows without bound.

## Data model

| Table | Key | Notes |
|---|---|---|
| `sessions` | `++id`; indexes `date`, `startTs`, `key`, `[date+key]` | One continuous visit within one local day. Stores `domain`, `host`, `key`, times, `categoryId`, and `ruleSource`. No URL and no title. |
| `dailyAggregates` | `[date+key+categoryId]` | Powers the totals, split, top sites, and trend. |
| `hourlyAggregates` | `[date+hour+key+categoryId]` | Powers the heatmap and day dial. Kept because raw sessions are pruned by retention. |
| `categories` | `id` | Four built-ins (`productive`, `entertainment`, `neutral`, `uncategorized`) plus custom ones. Each custom category maps to a scoring kind. |
| `domainRules` | `++id` | `keyword` (title words and/or path prefix on a site), `host` (exact subdomain), or `domain`. |
| `meta` | `key` | `sessionsCoverFrom` is the earliest date with complete raw sessions. |

Settings live in `chrome.storage.local` so the worker reacts to changes through `storage.onChanged`.

Dashboard queries hit only the aggregate tables through their `date` index. A year is about 365 × (number of sites) rows per table, which loads in milliseconds. Raw sessions are read only for the 7-day focus streak.

## Categorization

`categorize()` in `core/rules.ts` checks, in order:

1. keyword rules (highest `priority` first)
2. exact host rules
3. domain rules
4. the built-in dictionary of about 200 sites (`data/defaults/dictionary.ts`), most specific entry first
5. Uncategorized

The tracker reads rules on every reconcile, so edits apply at once (the UI also sends a `reconcile` message).

**Re-labelling history.** `applyRulesToHistory()` re-runs the non-keyword rules over stored sessions and rebuilds aggregates for affected dates within the session window. For older dates, where only aggregates remain, it relabels aggregate rows by site and merges rows that collide. Sessions originally matched by a keyword rule keep their category, because their titles were never stored.

## Retention

A 6-hourly alarm, and any change to the retention setting, deletes `sessions` older than N days and advances `sessionsCoverFrom`. Aggregates are never pruned.

## UI notes

- **Theme:** tokens live as CSS variables in `src/ui/index.css`, with separate light and dark values.
  - The three category hues were validated for color-vision-deficiency separation in both modes.
  - Uncategorized time is hatched, so it never relies on color alone.
  - The font is bundled, so no font CDN is used.
- **Live time:** the popup and dashboard add the open session's not-yet-flushed time (`withLive`), so the numbers tick between flushes without writing to the database.
- **Day dial:** a 24-hour radial chart with noon at the top, like a sundial. The hand points at the current time.
