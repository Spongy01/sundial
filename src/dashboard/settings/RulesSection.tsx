import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { parseSite } from '../../core/domain';
import type { DomainRule, RuleType } from '../../core/rules';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { CategoryChip, Toggle } from '../../ui/components';
import { nudgeTracker, useCategories } from '../../ui/hooks';
import { Button, Dialog } from '../components/Dialog';
import { inputCls, Section, selectCls } from './shared';

const TYPE_LABEL: Record<RuleType, string> = {
  keyword: 'Title or path',
  host: 'Exact subdomain',
  domain: 'Whole site',
};
const TYPE_ORDER: RuleType[] = ['keyword', 'host', 'domain'];

type Draft = {
  id?: number;
  type: RuleType;
  matchDomain: string;
  keywords: string;
  pathPrefix: string;
  categoryId: string;
  priority: number;
  enabled: boolean;
  isExample?: boolean;
};

const emptyDraft = (): Draft => ({
  type: 'keyword',
  matchDomain: '',
  keywords: '',
  pathPrefix: '',
  categoryId: 'productive',
  priority: 0,
  enabled: true,
});

function describeRule(r: DomainRule): string {
  if (r.type === 'keyword') {
    const parts = [];
    if (r.titleKeywords?.length) parts.push(`title contains ${r.titleKeywords.map((k) => `"${k}"`).join(' or ')}`);
    if (r.pathPrefix) parts.push(`path starts with ${r.pathPrefix}`);
    return `${r.matchDomain}, ${parts.join(' and ')}`;
  }
  return r.matchDomain;
}

export function RulesSection() {
  const cats = useCategories();
  const rules = useLiveQuery(() => db.domainRules.toArray(), []) ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sorted = [...rules].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.priority - a.priority || a.matchDomain.localeCompare(b.matchDomain),
  );

  const edit = (r: DomainRule) => {
    setDraft({
      id: r.id,
      type: r.type,
      matchDomain: r.matchDomain,
      keywords: (r.titleKeywords ?? []).join(', '),
      pathPrefix: r.pathPrefix ?? '',
      categoryId: r.categoryId,
      priority: r.priority,
      enabled: r.enabled,
      isExample: r.isExample,
    });
    setHistory(false);
    setError('');
  };

  const save = async () => {
    if (!draft) return;
    const site = parseSite(`https://${draft.matchDomain.trim().replace(/^https?:\/\//, '')}`);
    if (!site) return setError('Enter a site like youtube.com or docs.google.com.');
    const matchDomain = draft.type === 'domain' ? site.domain : site.host;
    const keywords = draft.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const pathPrefix = draft.pathPrefix.trim() ? `/${draft.pathPrefix.trim().replace(/^\/+/, '')}` : '';
    if (draft.type === 'keyword' && !keywords.length && !pathPrefix) {
      return setError('Add at least one title keyword or a path.');
    }
    const rule: DomainRule = {
      type: draft.type,
      matchDomain,
      categoryId: draft.categoryId,
      priority: draft.priority,
      enabled: draft.enabled,
      ...(draft.type === 'keyword' && { titleKeywords: keywords, pathPrefix: pathPrefix || undefined }),
      ...(draft.isExample && { isExample: true }),
    };
    setBusy(true);
    try {
      if (draft.id !== undefined) await db.domainRules.put({ ...rule, id: draft.id });
      else await db.domainRules.add(rule);
      if (history && draft.type !== 'keyword') await repo.applyRulesToHistory();
      nudgeTracker();
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="rules"
      title="Rules"
      description="Rules decide a site's category. Title or path rules are checked first, then exact subdomains, then whole sites, then Sundial's built-in list."
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-ink-3">No rules yet. Changing a site's category on the overview also creates a rule here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <Toggle checked={r.enabled} onChange={(v) => void db.domainRules.update(r.id!, { enabled: v }).then(nudgeTracker)} label="Rule enabled" />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${r.enabled ? '' : 'text-ink-3 line-through'}`}>{describeRule(r)}</div>
                <div className="text-xs text-ink-3">
                  {TYPE_LABEL[r.type]}
                  {r.type === 'keyword' && r.priority !== 0 && `, priority ${r.priority}`}
                  {r.isExample && ', example rule'}
                </div>
              </div>
              <CategoryChip cat={cats.map.get(r.categoryId)} />
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => edit(r)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => void db.domainRules.delete(r.id!).then(nudgeTracker)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Button
          variant="primary"
          onClick={() => {
            setDraft(emptyDraft());
            setHistory(false);
            setError('');
          }}
        >
          Add rule
        </Button>
      </div>

      <Dialog
        open={draft !== null}
        onClose={() => !busy && setDraft(null)}
        title={draft?.id !== undefined ? 'Edit rule' : 'Add rule'}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save rule'}
            </Button>
          </>
        }
      >
        {draft && (
          <form
            className="space-y-3 text-ink"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block">
              <span className="text-xs text-ink-3">Match by</span>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as RuleType })}
                className={`${selectCls} mt-1 w-full`}
              >
                <option value="keyword">Page title or path on a site</option>
                <option value="host">Exact subdomain (docs.google.com)</option>
                <option value="domain">Whole site (youtube.com and its subdomains)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-3">Site</span>
              <input
                value={draft.matchDomain}
                onChange={(e) => setDraft({ ...draft, matchDomain: e.target.value })}
                placeholder="youtube.com"
                className={`${inputCls} mt-1 w-full`}
                autoFocus
              />
            </label>
            {draft.type === 'keyword' && (
              <>
                <label className="block">
                  <span className="text-xs text-ink-3">Title contains any of (comma separated)</span>
                  <input
                    value={draft.keywords}
                    onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
                    placeholder="tutorial, lecture, course"
                    className={`${inputCls} mt-1 w-full`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-3">and/or path starts with (optional)</span>
                  <input
                    value={draft.pathPrefix}
                    onChange={(e) => setDraft({ ...draft, pathPrefix: e.target.value })}
                    placeholder="/r/programming"
                    className={`${inputCls} mt-1 w-full`}
                  />
                </label>
                <p className="text-xs text-ink-3">Titles and paths are checked while you browse and are never stored.</p>
              </>
            )}
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="text-xs text-ink-3">Category</span>
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                  className={`${selectCls} mt-1 w-full`}
                >
                  {cats.list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {draft.type === 'keyword' && (
                <label className="block w-24">
                  <span className="text-xs text-ink-3">Priority</span>
                  <input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                    className={`${inputCls} mt-1 w-full`}
                  />
                </label>
              )}
            </div>
            {draft.type !== 'keyword' && (
              <label className="flex items-start gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} className="mt-0.5" />
                Also re-label time already recorded, using all current rules
              </label>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Dialog>
    </Section>
  );
}
