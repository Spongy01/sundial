# Sundial

A browser extension that measures how much time you spend on each website and shows how it splits between **productive**, **entertainment**, and **neutral** browsing.

- Works in Chrome, Brave, Edge, and Arc (Manifest V3).
- 100% local. No servers, accounts, analytics, or network requests. Data lives in your browser's IndexedDB.
- Only site names are stored, never full URLs, page titles, or page content.

## Install (load unpacked)

You need Node.js 20 or newer.

```bash
npm install
npm run build        # produces dist/
```

Then load `dist/` into your browser:

| Browser | Steps |
|---|---|
| **Chrome** | Go to `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick the `dist` folder. |
| **Brave** | Go to `brave://extensions` and follow the same steps as Chrome. |
| **Edge** | Go to `edge://extensions`, turn on **Developer mode** (left sidebar), click **Load unpacked**, and pick `dist`. |
| **Arc** | Go to `arc://extensions` (or Extensions in the sidebar menu), turn on **Developer mode**, click **Load unpacked**, and pick `dist`. |

On first install Sundial opens a welcome page. Pin the toolbar icon (puzzle-piece menu, then the pin) so today's numbers are one click away. After pulling changes, run `npm run build` again and click **Reload** on the extension card.

To track incognito windows, turn the setting on in Sundial **and** enable **Allow in Incognito** on the extension's details page.

## Using it

- **Popup** (toolbar icon): today's total, a 24-hour dial of your day, the focus score, the current site with a live timer, the top 3 sites, a pause switch, and a link to the dashboard.
- **Dashboard**: pick Today, Yesterday, 7 days, 30 days, or a custom range. It shows:
  - the total and the productive/entertainment/neutral split, with a focus score of productive ÷ (productive + entertainment)
  - top sites, where you can click a site's category chip to change it
  - day-by-day trend
  - hour-of-day heatmap
  - **Needs a label** for sites Sundial doesn't recognize
  - weekly insights
- **Settings**: categories, rules (title/path, exact subdomain, whole site), never-track list, per-subdomain sites, idle threshold, retention, JSON/CSV export, JSON import, and delete all data.

### What counts as time

Time counts only when **all** of these are true:

1. The tab is the active tab in the browser window that has OS focus. When you switch to another app, the clock stops.
2. You are not idle. The default is 60 seconds with no input. If the tab is playing audio or video, time keeps counting while idle. Locking the screen always stops the clock.
3. The page is `http` or `https`. Browser pages, new tab pages, and extension pages are ignored.
4. The window is not incognito, unless you enabled it.

Sites are grouped by registrable domain using the Public Suffix List, so `www.youtube.com` and `m.youtube.com` count as `youtube.com`, and `news.bbc.co.uk` counts as `bbc.co.uk`. `google.com` is split by subdomain by default, so Docs and Gmail are separate. You can add other domains in Settings.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read the active tab's URL and title to work out which site you're on and to evaluate title/path rules. Only the site name and resulting category are stored. |
| `idle` | Stop the clock when you step away or lock the screen. |
| `alarms` | Save progress every 30 seconds (so a crash loses at most ~30s) and run the retention cleanup. |
| `storage` | Keep settings and the in-progress session, which has to survive the MV3 service worker being stopped. |
| `unlimitedStorage` | Let a year or more of history live in IndexedDB without hitting the default quota. |
| `favicon` | Show site icons from the browser's **local** favicon cache. This avoids fetching icons from the web. |

Sundial requests **no host permissions** and injects **no content scripts**.

## Development

```bash
npm test             # Vitest unit tests (chrome.* APIs are mocked; IndexedDB via fake-indexeddb)
npm run typecheck
npm run build
npm run preview:ui   # http://localhost:5199/?page=popup or ?page=dashboard — UI with fake data, no extension needed
```

Preview options: `&empty` shows empty states, `&range=7d` picks a range, and `#/settings` or `#/welcome` opens other pages.

To watch the tracker work, open the extension card in `chrome://extensions` and click **service worker** to open its console. It logs lines like `[sundial] open github.com [productive] (tab-activated)` and `close github.com 42.0s (focus-changed)`. Stored data is under DevTools → Application → IndexedDB → `sundial`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

## Known limitations

- Re-labelling history can't re-check title/path rules, because titles and paths are never stored. Time originally matched by such a rule keeps its category.
- Raw sessions older than the retention period (90 days by default) are deleted. Their daily and hourly totals stay, so charts keep the full history, but re-labelling that old time works per site only.
- Before Chrome 120, alarms fire at most once a minute, so up to ~60s can be lost on a crash instead of ~30s.
- If a browser doesn't support the `_favicon` endpoint, site icons fall back to letter tiles.
