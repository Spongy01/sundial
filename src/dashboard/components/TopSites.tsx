import { useState } from 'react';
import type { SiteTotal } from '../../core/summary';
import { Empty, Favicon } from '../../ui/components';
import { formatDuration } from '../../ui/format';
import { categoryColor, useCategories } from '../../ui/hooks';
import { CategoryPicker } from './CategoryPicker';

const INITIAL = 10;

export function TopSites({ sites }: { sites: SiteTotal[] }) {
  const cats = useCategories();
  const [all, setAll] = useState(false);
  const max = sites[0]?.totalMs ?? 0;
  const shown = all ? sites : sites.slice(0, INITIAL);

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line md:p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Top sites</h2>
        {sites.length > 0 && <span className="text-xs text-ink-3">{sites.length} sites</span>}
      </div>
      {sites.length === 0 ? (
        <Empty title="No browsing recorded in this range">Pick a different range, or browse a little and check back.</Empty>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {shown.map((s) => {
            const cat = cats.map.get(s.categoryId);
            const uncategorized = !cat || cat.kind === 'uncategorized';
            return (
              <li key={s.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr_4rem_9.5rem]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Favicon site={s.key} size={18} />
                  <span className="truncate text-sm font-medium" title={s.key}>
                    {s.key}
                  </span>
                </div>
                <div className="order-last col-span-3 h-2 rounded-full bg-surface-2 sm:order-none sm:col-span-1">
                  <div
                    className={`h-full rounded-full ${uncategorized ? 'hatch' : ''}`}
                    style={{ width: `${Math.max(1.5, (s.totalMs / max) * 100)}%`, background: uncategorized ? undefined : categoryColor(cat) }}
                  />
                </div>
                <span className="w-16 text-right text-sm tabular-nums">{formatDuration(s.totalMs)}</span>
                <div className="justify-self-end">
                  <CategoryPicker siteKey={s.key} categoryId={s.categoryId} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {sites.length > INITIAL && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-sm font-medium text-ink-2 hover:text-ink">
          {all ? 'Show fewer' : `Show all ${sites.length}`}
        </button>
      )}
    </section>
  );
}
