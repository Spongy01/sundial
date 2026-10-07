import { useState } from 'react';
import type { CategoryKind } from '../../core/types';
import { db, type Category } from '../../data/db';
import { deleteCategory } from '../../data/maintenance';
import { Swatch } from '../../ui/components';
import { nudgeTracker, useCategories } from '../../ui/hooks';
import { Button, Dialog } from '../components/Dialog';
import { inputCls, Section, selectCls } from './shared';

/** Extra hues for custom categories, distinct from the three built-in ones. */
const PALETTE = ['#2a78d6', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#008300', '#0e9fb3', '#8a5a2b'];

const KIND_LABEL: Record<Exclude<CategoryKind, 'uncategorized'>, string> = {
  productive: 'Counts as productive',
  entertainment: 'Counts as entertainment',
  neutral: 'Counts as neutral',
};

export function CategoriesSection() {
  const cats = useCategories();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Exclude<CategoryKind, 'uncategorized'>>('productive');
  const [color, setColor] = useState(PALETTE[0]!);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [error, setError] = useState('');

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (cats.list.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      setError(`A category called "${n}" already exists.`);
      return;
    }
    await db.categories.add({ id: crypto.randomUUID(), name: n, color, kind, builtin: false });
    setName('');
    setError('');
    setColor(PALETTE[(cats.list.filter((c) => !c.builtin).length + 1) % PALETTE.length]!);
  };

  return (
    <Section
      id="categories"
      title="Categories"
      description="Custom categories keep their own name and color, and count toward productive, entertainment, or neutral in your focus score."
    >
      <ul className="divide-y divide-line">
        {cats.list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Swatch cat={c} className="size-3" />
            <input
              aria-label={`Name of ${c.name}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) void db.categories.update(c.id, { name: v });
                else e.target.value = c.name;
              }}
              className={`${inputCls} w-44 bg-transparent ring-transparent hover:ring-line`}
            />
            <div className="ml-auto flex items-center gap-2">
              {c.builtin ? (
                <span className="text-sm text-ink-3">Built in</span>
              ) : (
                <>
                  <ColorPicker value={c.color} onChange={(v) => void db.categories.update(c.id, { color: v })} label={`Color of ${c.name}`} />
                  <select
                    aria-label={`Scoring for ${c.name}`}
                    value={c.kind}
                    onChange={(e) => void db.categories.update(c.id, { kind: e.target.value as CategoryKind })}
                    className={selectCls}
                  >
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" onClick={() => setDeleting(c)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          aria-label="New category name"
          placeholder="New category, e.g. Learning"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} min-w-52 flex-1`}
        />
        <ColorPicker value={color} onChange={setColor} label="New category color" />
        <select aria-label="Scoring" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={selectCls}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Add category
        </Button>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </form>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = deleting;
                setDeleting(null);
                if (c) void deleteCategory(c.id).then(nudgeTracker);
              }}
            >
              Delete category
            </Button>
          </>
        }
      >
        Time recorded under it moves to Uncategorized, and rules that used it are removed.
      </Dialog>
    </Section>
  );
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {PALETTE.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={p}
          onClick={() => onChange(p)}
          className={`size-5 rounded-full ${value === p ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
          style={{ background: p }}
        />
      ))}
    </div>
  );
}
