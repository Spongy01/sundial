import { useRef, useState } from 'react';
import { parseSite } from '../../core/domain';
import { localDateKey } from '../../core/time';
import type { Settings as SettingsT } from '../../core/types';
import { db } from '../../data/db';
import { dailyCsv, exportAll, importAll, ImportError, parseExport, sessionsCsv, type ExportFile } from '../../data/exportImport';
import { wipeAllData } from '../../data/maintenance';
import { updateSettings } from '../../data/settings';
import { Toggle } from '../../ui/components';
import { nudgeTracker, useCategories, useSettings } from '../../ui/hooks';
import { Button, Dialog } from '../components/Dialog';
import { CategoriesSection } from '../settings/CategoriesSection';
import { RulesSection } from '../settings/RulesSection';
import { discardOpenSession, downloadFile, Field, inputCls, Section, selectCls } from '../settings/shared';

const IDLE_OPTIONS = [30, 60, 120, 300, 600, 900];
const RETENTION_OPTIONS = [14, 30, 90, 180, 365, 0];

const NAV = [
  ['tracking', 'Tracking'],
  ['categories', 'Categories'],
  ['rules', 'Rules'],
  ['sites', 'Sites'],
  ['data', 'Your data'],
] as const;

export function Settings() {
  const [settings, loaded] = useSettings();
  if (!loaded) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="sticky top-24 space-y-1 text-sm">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#/settings`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }} className="block rounded-md px-2.5 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-5">
        <TrackingSection settings={settings} />
        <CategoriesSection />
        <RulesSection />
        <SitesSection settings={settings} />
        <DataSection settings={settings} />
      </div>
    </div>
  );
}

function TrackingSection({ settings }: { settings: SettingsT }) {
  return (
    <Section id="tracking" title="Tracking">
      <div className="divide-y divide-line">
        <Field label="Track time" hint="Turn off to pause recording. The toolbar popup has the same switch.">
          <Toggle checked={!settings.paused} onChange={(v) => void updateSettings({ paused: !v })} label="Track time" />
        </Field>
        <Field
          htmlFor="idle"
          label="Stop counting after"
          hint="With no mouse or keyboard input for this long, the clock stops. Audio or video playing in the tab keeps it running."
        >
          <select
            id="idle"
            value={settings.idleThresholdSec}
            onChange={(e) => void updateSettings({ idleThresholdSec: Number(e.target.value) })}
            className={selectCls}
          >
            {[...new Set([...IDLE_OPTIONS, settings.idleThresholdSec])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? '' : 's'}`} idle
                </option>
              ))}
          </select>
        </Field>
        <Field
          label="Track incognito windows"
          hint={
            <>
              Off by default. To use this, also turn on <strong className="font-medium">Allow in Incognito</strong> on Sundial's
              page in your browser's extensions settings.
            </>
          }
        >
          <Toggle checked={settings.trackIncognito} onChange={(v) => void updateSettings({ trackIncognito: v })} label="Track incognito windows" />
        </Field>
      </div>
    </Section>
  );
}

function SitesSection({ settings }: { settings: SettingsT }) {
  return (
    <Section id="sites" title="Sites">
      <div className="space-y-6">
        <SiteList
          title="Never track"
          hint="Time on these sites (and their subdomains) is not recorded at all."
          values={settings.excludedDomains}
          placeholder="bank.com"
          onChange={(v) => void updateSettings({ excludedDomains: v })}
          mode="host"
        />
        <SiteList
          title="Count subdomains separately"
          hint="For sites like google.com where docs.google.com and mail.google.com are very different. Applies to new time."
          values={settings.splitSubdomains}
          placeholder="google.com"
          onChange={(v) => void updateSettings({ splitSubdomains: v })}
          mode="domain"
        />
      </div>
    </Section>
  );
}

function SiteList({
  title,
  hint,
  values,
  placeholder,
  onChange,
  mode,
}: {
  title: string;
  hint: string;
  values: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
  mode: 'host' | 'domain';
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const site = parseSite(`https://${text.trim().replace(/^https?:\/\//, '')}`);
    if (!site) return setError(`Enter a site like ${placeholder}.`);
    const v = mode === 'domain' ? site.domain : site.host;
    if (!values.includes(v)) onChange([...values, v].sort());
    setText('');
    setError('');
  };
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-0.5 text-sm text-ink-3">{hint}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <li key={v} className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm ring-1 ring-line">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input aria-label={`Add to ${title}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className={`${inputCls} w-56`} />
        <Button type="submit" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

function DataSection({ settings }: { settings: SettingsT }) {
  const cats = useCategories();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<ExportFile | null>(null);
  const [importError, setImportError] = useState('');
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState('');
  const stamp = localDateKey(Date.now());

  const exportJson = async () => {
    const file = await exportAll(settings);
    downloadFile(`sundial-${stamp}.json`, JSON.stringify(file, null, 1), 'application/json');
  };
  const exportDailyCsv = async () => downloadFile(`sundial-daily-${stamp}.csv`, dailyCsv(await db.dailyAggregates.toArray(), cats.map), 'text/csv');
  const exportSessionsCsv = async () => downloadFile(`sundial-sessions-${stamp}.csv`, sessionsCsv(await db.sessions.toArray(), cats.map), 'text/csv');

  const onPick = async (f: File | undefined) => {
    if (!f) return;
    setImportError('');
    try {
      setImporting(parseExport(await f.text()));
    } catch (e) {
      setImportError(e instanceof ImportError ? e.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!importing) return;
    const file = importing;
    setImporting(null);
    await discardOpenSession();
    await importAll(file);
    await updateSettings({ ...file.settings, paused: settings.paused });
    nudgeTracker();
    setStatus(`Imported ${file.sessions.length.toLocaleString()} sessions and ${file.dailyAggregates.length.toLocaleString()} daily totals.`);
  };

  const doWipe = async () => {
    setWipeOpen(false);
    setConfirmText('');
    await discardOpenSession();
    await wipeAllData(localDateKey(Date.now()));
    nudgeTracker();
    setStatus('All Sundial data was deleted.');
  };

  return (
    <Section id="data" title="Your data" description="Everything stays in this browser. Sundial never sends anything anywhere.">
      <div className="divide-y divide-line">
        <Field
          htmlFor="retention"
          label="Keep detailed sessions for"
          hint="Older sessions are deleted automatically. Daily and hourly totals are kept, so charts still show your full history."
        >
          <select
            id="retention"
            value={settings.retentionDays}
            onChange={(e) => void updateSettings({ retentionDays: Number(e.target.value) })}
            className={selectCls}
          >
            {RETENTION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'Forever' : d === 365 ? '1 year' : `${d} days`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Export" hint="A full JSON backup, or spreadsheets of daily totals and individual sessions.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void exportJson()}>Export JSON</Button>
            <Button onClick={() => void exportDailyCsv()}>Daily CSV</Button>
            <Button onClick={() => void exportSessionsCsv()}>Sessions CSV</Button>
          </div>
        </Field>
        <Field label="Import" hint={importError ? <span className="text-danger">{importError}</span> : 'Restore a Sundial JSON backup. This replaces the data in this browser.'}>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onPick(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()}>Choose file…</Button>
        </Field>
        <Field label="Delete all data" hint="Erases every session, total, category, and rule. Settings stay.">
          <Button variant="danger" onClick={() => setWipeOpen(true)}>
            Delete all data
          </Button>
        </Field>
      </div>
      {status && (
        <p role="status" className="mt-3 text-sm text-ink-2">
          {status}
        </p>
      )}

      <Dialog
        open={importing !== null}
        onClose={() => setImporting(null)}
        title="Replace your data with this backup?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setImporting(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void doImport()}>
              Replace data
            </Button>
          </>
        }
      >
        {importing && (
          <p>
            The backup{importing.exportedAt && ` from ${new Date(importing.exportedAt).toLocaleDateString()}`} has{' '}
            {importing.sessions.length.toLocaleString()} sessions, {importing.dailyAggregates.length.toLocaleString()} daily totals, and{' '}
            {importing.categories.length} categories. Everything Sundial has stored in this browser will be replaced.
          </p>
        )}
      </Dialog>

      <Dialog
        open={wipeOpen}
        onClose={() => {
          setWipeOpen(false);
          setConfirmText('');
        }}
        title="Delete all Sundial data?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirmText.trim().toLowerCase() !== 'delete'} onClick={() => void doWipe()}>
              Delete everything
            </Button>
          </>
        }
      >
        <p>This can't be undone. Export a backup first if you might want this history later.</p>
        <label className="mt-3 block text-ink">
          <span className="text-xs text-ink-3">Type delete to confirm</span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${inputCls} mt-1 w-full`} autoComplete="off" />
        </label>
      </Dialog>
    </Section>
  );
}
