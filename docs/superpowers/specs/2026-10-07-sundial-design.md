# Sundial — Design Spec (approved 2026-10-07)

## Context
Sundial is a local-only MV3 browser extension that measures active time per website and splits it into productive, entertainment, and neutral time. Target browsers are Chrome, Brave, Edge, and Arc. It has no servers, no network requests, and no full URLs stored. The project directory is empty (not yet a git repo), so this is a greenfield build in 6 phases with a commit after each one.

**Decisions confirmed with you:** strict window focus (an unfocused window never counts, even with audio). An idle session ends at the idle event, with no backdating. Custom categories map to a scoring kind. A locked screen always stops the clock.

---

## 1. Architecture

```
┌───────────── Service worker (background) ─────────────┐
│ event listeners ──► reconcile() ──► open/close/flush  │
│   tabs.onActivated/onUpdated/onRemoved                │
│   windows.onFocusChanged, idle.onStateChanged         │
│   alarms (flush 30s, retention daily)                 │
│   storage.onChanged (pause/settings)                  │
│        │ pure core (no chrome.*)                      │
│        ▼                                              │
│ core/eligibility → core/domain → core/rules           │
│        │                                              │
│ chrome.storage.session: OpenSession                   │
│ Dexie (IndexedDB): sessions, aggregates, rules, cats  │
└───────────────────────────────────────────────────────┘
        ▲ Dexie live queries + storage.session read
┌───────┴────────┐   ┌─────────────────────────────┐
│ Popup (React)  │   │ Dashboard (React, hash-     │
│                │   │ routed: overview/settings/  │
│                │   │ onboarding)                 │
└────────────────┘   └─────────────────────────────┘
```

### Key design: one idempotent `reconcile()` with no per-event logic
Each event calls the same `reconcile(reason)`:
1. Take a **snapshot** from Chrome: the last-focused window (must have `focused`, must not be incognito unless that is enabled), its active tab (url, title, audible), the idle state (`chrome.idle.queryState`), and settings (paused, excluded domains).
2. The pure function `computeDesiredTarget(snapshot) → Target | null` returns null for non-http(s), excluded, paused, locked, idle-and-not-audible, unfocused, or incognito-disallowed. A Target is `{ key, domain, host, categoryId, ruleSource, tabId }`.
3. Compare with the stored `OpenSession`. If the key or category differs, **close** the old session (final flush) and **open** a new one. If they match, do nothing.

Every event goes through this one path, so event ordering bugs (focus vs. activation races, popup focus flicker) resolve themselves: the snapshot always reflects the current truth. A `chrome.windows.WINDOW_ID_NONE` focus event simply produces null, which closes the session. Calls are serialized through a promise queue so concurrent events cannot interleave.

Title changes (YouTube SPA navigation updates `title` after `url`) trigger `onUpdated`, which runs reconcile. If the title rule now yields a different category, the session rolls over. That is how the "YouTube tutorial = Productive" rule takes effect mid-session.

### Persistence and crash-safety (a refinement of your spec)
`chrome.storage.session` survives service-worker kills but is **cleared on browser quit**, so it cannot by itself support "recover on startup." The approach:
- `OpenSession` lives in `storage.session` as you specified: `{ key, domain, host, categoryId, ruleSource, tabId, startTs, flushedUntilTs, sessionRowId, lastHeartbeatTs }`.
- The **30s alarm performs an incremental flush**. It upserts the session's Dexie row (`endTs`, `durationMs`) and adds the delta `now − flushedUntilTs` to the daily and hourly aggregates in a single Dexie transaction. Durable data therefore always runs up to the last flush, and a crash or quit loses at most about 30s with nothing to replay.
- **Gap guard (sleep/wake):** at each flush and reconcile, if `now − lastHeartbeatTs > 2 × flushInterval + 15s`, the machine slept or the SW was frozen. The session closes at `lastHeartbeatTs`, the gap is discarded, and a new session starts if the target is still valid. A hard cap (`maxSessionMs`, default 4h) is a second safety net.
- **On `runtime.onStartup` / `onInstalled`:** any leftover OpenSession is closed at its `lastHeartbeatTs` (already durable), then reconcile runs.
- **Midnight:** a flush or close whose interval crosses local midnight is split with `splitAtMidnight()`. The current row is closed at 23:59:59.999 and a new row starts for the new day. Every session row and aggregate belongs to exactly one local date. DST is handled by computing boundaries with `Date` local-time constructors, never by adding 24h.
- Alarm period is 0.5 min, which needs Chrome 120+. Older browsers fall back to 1 min automatically, and that is noted in the README.

### Domain normalization
I'll use **`tldts`**, which bundles the Public Suffix List offline (~40KB gz) and is MIT-licensed. Example: `getDomain('news.bbc.co.uk') = 'bbc.co.uk'`. `host` drops a leading `www.`/`m.`. The **tracking key** is the host for domains in the "split subdomains" setting (default: `google.com`, so docs.google.com and mail.google.com are separate) and the registrable domain otherwise. IPs and `localhost` use the hostname as-is.

### Browser compatibility notes
- Arc, Brave, and Edge all implement `tabs`, `windows`, `idle`, `alarms`, `storage.session`, and IndexedDB. Arc's "Little Arc" windows are normal windows.
- New-tab pages (`chrome://newtab`, `edge://`, `brave://`, `arc://`) fail the http(s) check. Google's NTP (`https://www.google.com/_/chrome/newtab`) is explicitly excluded.

---

## 2. Data model (Dexie, DB `sundial`, v1)

| Table | Primary key / indexes | Fields |
|---|---|---|
| `sessions` | `++id`, `date`, `startTs`, `key`, `[date+key]` | id, date (`YYYY-MM-DD` local), domain, host, key, startTs, endTs, durationMs, categoryId, ruleSource (`keyword`/`host`/`domain`/`dictionary`/`none`) |
| `dailyAggregates` | `[date+key+categoryId]`, `date`, `key` | date, key, domain, categoryId, totalMs |
| `hourlyAggregates` | `[date+hour+key+categoryId]`, `date`, `key` | date, hour (0–23), key, categoryId, totalMs |
| `categories` | `id`, `kind` | id (`productive`/`entertainment`/`neutral`/`uncategorized` built-ins, uuid for custom), name, color, kind (`productive`/`entertainment`/`neutral`/`uncategorized`), builtin |
| `domainRules` | `++id`, `priority`, `matchDomain` | id, type (`keyword`/`host`/`domain`), matchDomain, host?, pathPrefix?, titleKeywords?[], categoryId, priority, enabled, isExample |
| `meta` | `key` | small key/value pairs (schema version, onboarding seen, last retention run) |

**Settings** go in `chrome.storage.local` rather than Dexie, because they are small, the SW can read them quickly, and `storage.onChanged` tells the SW the moment you pause or change something: `{ idleThresholdSec: 60, trackIncognito: false, retentionDays: 90, excludedDomains: [], splitSubdomains: ['google.com'], paused: false, maxSessionMs }`.

**Deviations from your spec, with reasons:**
1. **`categoryId` is added to aggregates.** The stacked daily trend and the split need category per day, and without it every dashboard query would join through sessions.
2. **An `hourlyAggregates` table is added.** The hour-of-day heatmap needs hourly data, and raw sessions get deleted by retention. Rows are small (about 50–150 per active day).
3. **Recategorizing history after retention:** within the retention window, aggregates are **rebuilt from sessions** (`rebuildAggregates(dateRange)`), as you specified. Older dates have no sessions, so their aggregates are **relabelled by key**. Keyword-rule results from that period can't be re-evaluated because titles are never stored, and the confirm dialog says so.
4. **The default dictionary is a static TS module** (`defaults/dictionary.ts`), not DB rows. It isn't user data, and it can then update with releases. User edits become `domain` rules, which take priority over it.

### Rules engine (pure, `core/rules.ts`)
`categorize({domain, host, path, title}, rules, dictionary) → {categoryId, ruleSource}` in strict priority order:
1. **keyword** rules (domain + optional path prefix + title keywords, case-insensitive). Ties are broken by the `priority` field.
2. **host** rules (exact subdomain)
3. **domain** rules
4. default dictionary (checks host first, then domain)
5. `uncategorized`

Path and title exist only in memory during evaluation. Only `categoryId` and `ruleSource` are stored. An example rule ships with the extension: *youtube.com + title contains tutorial | lecture | course | lesson → Productive*.

---

## 3. Folder structure

```
SunDial/
├─ manifest.config.ts          # defineManifest (crxjs)
├─ vite.config.ts  vitest.config.ts  tailwind.config.ts  tsconfig.json
├─ public/icons/               # 16/32/48/128 png
├─ src/
│  ├─ core/                    # PURE, no chrome.*, 100% unit-tested
│  │  ├─ time.ts               # localDate(), splitAtMidnight(), hourBuckets()
│  │  ├─ domain.ts             # normalizeHost(), trackingKey()
│  │  ├─ eligibility.ts        # computeDesiredTarget(snapshot)
│  │  ├─ rules.ts              # categorize()
│  │  ├─ aggregate.ts          # sessionsToAggregates() (for rebuild)
│  │  └─ insights.ts           # score, biggest sink, wow delta, focus streak
│  ├─ background/
│  │  ├─ index.ts              # listener wiring only
│  │  ├─ tracker.ts            # reconcile(), open/close, serial queue
│  │  ├─ snapshot.ts           # chrome.* → Snapshot
│  │  ├─ openSession.ts        # storage.session wrapper
│  │  ├─ flush.ts              # incremental flush, gap guard
│  │  └─ retention.ts          # daily cleanup alarm
│  ├─ data/
│  │  ├─ db.ts                 # Dexie schema
│  │  ├─ repo.ts               # writeFlush(), queries, recategorize(), rebuild
│  │  ├─ settings.ts           # typed storage.local get/set/subscribe
│  │  ├─ exportImport.ts       # JSON/CSV export, validated JSON import
│  │  └─ defaults/ categories.ts dictionary.ts (~150) exampleRules.ts
│  ├─ ui/                      # shared React: theme, CategoryChip, Favicon,
│  │                           # formatDuration, useLiveSession, Card, ConfirmDialog
│  ├─ popup/   index.html main.tsx Popup.tsx
│  └─ dashboard/ index.html main.tsx App.tsx
│     ├─ pages/ Overview.tsx Settings.tsx Onboarding.tsx
│     └─ components/ RangeSwitcher Hero Donut TopSites DailyTrend
│                    HourHeatmap NeedsLabel Insights RulesEditor ...
├─ test/ chromeMock.ts setup.ts   # chrome.* fake with event emitters
├─ docs/ ARCHITECTURE.md  superpowers/specs/2026-10-07-sundial-design.md
└─ README.md
```

**Favicons:** I'll use the MV3 `favicon` permission with `chrome-extension://<id>/_favicon/?pageUrl=…`. It reads the browser's local favicon cache with **no network request**, which fits your privacy rule. It is one permission beyond your list, and I'd rather add it than fetch favicons from Google's S2 service, which would be a network leak. If you decline, I'll show a colored letter avatar instead. Arc's support for `_favicon` is unverified, and the letter avatar is the fallback there too.

**Toolbar icon:** a click can open the popup *or* the dashboard, not both. I'm going with the popup, plus an "Open dashboard" button. Onboarding opens the dashboard on first install.

**Permissions:** `tabs, idle, alarms, storage, unlimitedStorage, favicon`. No host permissions and no content scripts.

---

## 4. UI notes
- `dexie-react-hooks` `useLiveQuery` keeps the popup and dashboard reactive to flushes. The live timer adds `now − flushedUntilTs` from `storage.session`, refreshed every 1s, so the UI is accurate between 30s flushes.
- Productivity score = productive / (productive + entertainment). Custom categories count under their kind. Neutral and uncategorized are excluded, and the score shows "—" when the denominator is 0.
- **Focus streak:** the longest run of consecutive sessions in the range where the kind is productive, merged across gaps under 2 min. Neutral sessions don't break the streak; the first entertainment session does. This is computed from sessions and is limited to the retention window, so the minimum retention is 14 days.
- **Week comparison:** the last 7 days against the 7 days before, using aggregates.
- Dashboard routing uses a small hash router (no react-router). The look is calm and neutral with Tailwind `dark:` from `prefers-color-scheme`. I'll load the `dataviz` and `frontend-design` skills for phases 3–4.
- Recharts handles the donut and stacked bars. The hour heatmap is a custom CSS grid (7×24 or 1×24 depending on range), because Recharts has no heatmap.

---

## 5. Phases (a commit after each, on `main` in a new repo)

1. **Scaffold + tracking engine.** `git init`, Vite/crxjs/TS strict/Tailwind/Vitest setup, manifest, `core/{time,domain,eligibility}`, `background/*` writing to console only, chrome mock, and tests covering midnight split (including DST), idle, the audible exception, locked state, PSL (bbc.co.uk, github.io, IP, localhost), focus-none, gap guard, and stale-session recovery. The design spec doc goes into `docs/`.
2. **Storage + categorization.** Dexie schema, `repo.writeFlush` (incremental, transactional), aggregates, `core/rules`, the 150-domain dictionary, example rule, `rebuildAggregates`, `recategorize`. Tests cover rule priority and aggregate recomputation (using `fake-indexeddb`).
3. **Popup.** Today total, mini split bar, live current site with timer and chip, top 3, pause toggle, open-dashboard button.
4. **Dashboard.** Range switcher, hero with donut and score, top sites with recategorize chip, daily stacked trend, hour heatmap, Needs-a-label panel, insights.
5. **Settings.** Categories CRUD, rules editor, excluded domains, split-subdomain list, idle threshold, incognito toggle, retention and cleanup alarm, JSON/CSV export, validated JSON import, delete all (behind a typed confirm).
6. **Polish.** Icons (a sundial glyph SVG rendered to PNG sizes), empty states, onboarding, README (load unpacked in each browser, plus the reason for each permission), `ARCHITECTURE.md`.

## 6. Verification
- `npm test` (Vitest) passes after every phase, and `npm run build` produces `dist/`.
- Manual check after each phase: load `dist/` unpacked at `chrome://extensions` (Developer mode), open the **service worker console** from the extension card, and follow the step-by-step checks I'll give you (for example, phase 1 logs `[sundial] open youtube.com` and `close github.com 12.3s` while switching tabs or windows, going idle, and playing a video).
- Phase 2 onward: inspect data in DevTools → Application → IndexedDB → `sundial`.
- Once phases 3–6 are built, I can also drive the dashboard in your Chrome with the browser tools to take screenshots if you want.
