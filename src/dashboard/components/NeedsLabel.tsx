import { useState } from 'react';
import type { SiteTotal } from '../../core/summary';
import { Favicon, Swatch } from '../../ui/components';
import { formatDuration } from '../../ui/format';
import { useCategories } from '../../ui/hooks';
import { assignCategory } from './CategoryPicker';

const QUICK = ['productive', 'entertainment', 'neutral'];

/**
 * Uncategorized sites with one-click labelling. Their past time was
 * "Uncategorized", so labelling also re-labels history — there is nothing to
 * overwrite, and it's what people expect from triage.
 */
export function NeedsLabel({ sites }: { sites: SiteTotal[] }) {
  const cats = useCategories();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? sites : sites.slice(0, 6);
  const quick = QUICK.map((id) => cats.map.get(id)).filter((c) => c !== undefined);
  const custom = cats.list.filter((c) => !c.builtin);

  const label = async (key: string, categoryId: string) => {
    setBusy(key);
    try {
      await assignCategory(key, categoryId, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <h2 className="text-base font-semibold">Needs a label</h2>
      {sites.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">Every site in this range has a category.</p>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-ink-3">Label these so they count toward your split.</p>
          <ul className="mt-3 space-y-3">
            {shown.map((s) => (
              <li key={s.key} className={busy === s.key ? 'opacity-50' : ''}>
                <div className="flex items-center gap-2 text-sm">
                  <Favicon site={s.key} />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.key}</span>
                  <span className="tabular-nums text-ink-3">{formatDuration(s.totalMs)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                  {quick.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void label(s.key, c.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs text-ink-2 ring-1 ring-line hover:text-ink hover:ring-ink-3"
                    >
                      <Swatch cat={c} />
                      {c.name}
                    </button>
                  ))}
                  {custom.length > 0 && (
                    <select
                      aria-label={`Other category for ${s.key}`}
                      value=""
                      disabled={busy !== null}
                      onChange={(e) => e.target.value && void label(s.key, e.target.value)}
                      className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-2 ring-1 ring-line"
                    >
                      <option value="">More…</option>
                      {custom.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {sites.length > 6 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-medium text-ink-2 hover:text-ink">
              {showAll ? 'Show fewer' : `Show all ${sites.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
