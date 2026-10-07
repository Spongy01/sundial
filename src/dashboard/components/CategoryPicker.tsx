import { useEffect, useRef, useState } from 'react';
import { repo } from '../../data/repo';
import { CategoryChip, Swatch } from '../../ui/components';
import { nudgeTracker, useCategories } from '../../ui/hooks';
import { Button, Dialog } from './Dialog';

/** Set a site's category, optionally rewriting its history, and tell the tracker. */
export async function assignCategory(siteKey: string, categoryId: string, applyToHistory: boolean) {
  await repo.setSiteCategory(siteKey, categoryId, { applyToHistory });
  nudgeTracker();
}

/**
 * A category chip that opens a menu of categories. Picking one asks whether
 * past time for the site should be re-labelled too.
 */
export function CategoryPicker({ siteKey, categoryId }: { siteKey: string; categoryId: string }) {
  const cats = useCategories();
  const [menu, setMenu] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const apply = async (history: boolean) => {
    if (!pending) return;
    setBusy(true);
    try {
      await assignCategory(siteKey, pending, history);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const target = pending ? cats.map.get(pending) : undefined;

  return (
    <div ref={wrap} className="relative">
      <CategoryChip cat={cats.map.get(categoryId)} onClick={() => setMenu((m) => !m)} title={`Change category for ${siteKey}`} />
      {menu && (
        <ul
          role="menu"
          className="absolute right-0 z-20 mt-1 max-h-72 min-w-44 overflow-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line"
        >
          {cats.list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="menuitem"
                autoFocus={c.id === categoryId}
                onClick={() => {
                  setMenu(false);
                  if (c.id !== categoryId) setPending(c.id);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 ${c.id === categoryId ? 'font-medium' : ''}`}
              >
                <Swatch cat={c} />
                <span className="flex-1">{c.name}</span>
                {c.id === categoryId && <span className="text-xs text-ink-3">current</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={pending !== null}
        onClose={() => !busy && setPending(null)}
        title={`Move ${siteKey} to ${target?.name ?? ''}?`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void apply(false)} disabled={busy}>
              From now on
            </Button>
            <Button variant="primary" onClick={() => void apply(true)} disabled={busy}>
              Also update past time
            </Button>
          </>
        }
      >
        <p>New visits will count as {target?.name}. You can also re-label the time already recorded for this site.</p>
        <p className="mt-2 text-ink-3">
          Time that was matched by a title or path rule keeps its category. Sundial never stored page titles, so it can't re-check
          them.
        </p>
      </Dialog>
    </div>
  );
}
