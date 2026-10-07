import { getSettings, onSettingsChanged } from '../data/settings';
import { repo } from '../data/repo';
import { openSessionStore } from './openSession';
import { takeSnapshot } from './snapshot';
import { createTracker, FLUSH_INTERVAL_MS } from './tracker';

const FLUSH_ALARM = 'sundial-flush';

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
}

// Listeners must be registered synchronously at top level so events that wake
// the worker are delivered.
chrome.runtime.onStartup.addListener(() => {
  void tracker.recover().then(() => tracker.reconcile('startup'));
});
chrome.runtime.onInstalled.addListener(() => {
  void ensureSetup().then(() => tracker.reconcile('installed'));
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
});
onSettingsChanged((s) => {
  chrome.idle.setDetectionInterval(Math.max(15, s.idleThresholdSec));
  void tracker.reconcile('settings');
});

void ensureSetup().then(() => tracker.reconcile('worker-start'));
