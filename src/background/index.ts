import { localDateKey } from '../core/time';
import { applyRetention } from '../data/maintenance';
import { repo } from '../data/repo';
import { getSettings, onSettingsChanged } from '../data/settings';
import { openSessionStore } from './openSession';
import { takeSnapshot } from './snapshot';
import { createTracker, FLUSH_INTERVAL_MS } from './tracker';

const FLUSH_ALARM = 'sundial-flush';
const RETENTION_ALARM = 'sundial-retention';

const tracker = createTracker({
  now: () => Date.now(),
  settings: getSettings,
  snapshot: (s) => takeSnapshot(s.idleThresholdSec),
  categorizer: repo.getCategorizer,
  store: openSessionStore,
  sink: repo.sink,
  log: (msg, ...rest) => console.info(`[sundial] ${msg}`, ...rest),
});

async function ensureSetup(): Promise<void> {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(Math.max(15, settings.idleThresholdSec));
  if (!(await chrome.alarms.get(FLUSH_ALARM))) {
    await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_INTERVAL_MS / 60_000 });
  }
  if (!(await chrome.alarms.get(RETENTION_ALARM))) {
    await chrome.alarms.create(RETENTION_ALARM, { delayInMinutes: 1, periodInMinutes: 6 * 60 });
  }
}

async function runRetention(): Promise<void> {
  const { retentionDays } = await getSettings();
  const removed = await applyRetention(retentionDays, localDateKey(Date.now()));
  if (removed) console.info(`[sundial] retention: removed ${removed} sessions older than ${retentionDays} days`);
}

// Listeners must be registered synchronously at top level so events that wake
// the worker are delivered.
chrome.runtime.onStartup.addListener(() => {
  void tracker.recover().then(() => tracker.reconcile('startup'));
});
chrome.runtime.onInstalled.addListener((details) => {
  void ensureSetup().then(() => tracker.reconcile('installed'));
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html#/welcome') });
  }
});
chrome.tabs.onActivated.addListener(() => void tracker.reconcile('tab-activated'));
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (!tab.active) return;
  if (change.url !== undefined || change.title !== undefined || change.audible !== undefined) {
    void tracker.reconcile('tab-updated');
  }
});
chrome.tabs.onRemoved.addListener(() => void tracker.reconcile('tab-removed'));
chrome.windows.onFocusChanged.addListener(() => void tracker.reconcile('focus-changed'));
chrome.idle.onStateChanged.addListener((state) => void tracker.reconcile(`idle-${state}`));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) void tracker.reconcile('alarm');
  if (alarm.name === RETENTION_ALARM) void runRetention();
});
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const type = (msg as { type?: string } | null)?.type;
  if (type === 'reconcile') void tracker.reconcile('ui');
  if (type === 'discard-open') {
    void tracker.discard().then(() => sendResponse(true));
    return true; // respond asynchronously
  }
  return undefined;
});
let lastRetention: number | undefined;
onSettingsChanged((s) => {
  chrome.idle.setDetectionInterval(Math.max(15, s.idleThresholdSec));
  if (lastRetention !== undefined && lastRetention !== s.retentionDays) void runRetention();
  lastRetention = s.retentionDays;
  void tracker.reconcile('settings');
});
void getSettings().then((s) => (lastRetention ??= s.retentionDays));

void ensureSetup().then(() => tracker.reconcile('worker-start'));
