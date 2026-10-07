import { useState, type ReactNode } from 'react';
import type { KindTotals } from '../core/summary';
import type { Category } from '../data/db';
import { formatDuration } from './format';
import { categoryColor } from './hooks';

/** The browser's own cached favicon (no network); a letter tile if there is none. */
export function Favicon({ site, size = 16 }: { site: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(`https://${site}`)}&size=${size * 2}`;
  if (failed) {
    return (
      <span
        aria-hidden
        className="inline-grid shrink-0 place-items-center rounded-[4px] bg-surface-2 font-semibold text-ink-2"
        style={{ width: size, height: size, fontSize: size * 0.6 }}
      >
        {site.replace(/^www\./, '').charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-[3px]" onError={() => setFailed(true)} />;
}

export function Swatch({ cat, className = '' }: { cat: Category | undefined; className?: string }) {
  const uncategorized = !cat || cat.kind === 'uncategorized';
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${uncategorized ? 'hatch ring-1 ring-[var(--cat-uncategorized)] ring-inset' : ''} ${className}`}
      style={uncategorized ? undefined : { background: categoryColor(cat) }}
    />
  );
}

/** Category label with its swatch. Becomes a button when `onClick` is given. */
export function CategoryChip({ cat, onClick, title }: { cat: Category | undefined; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <Swatch cat={cat} />
      <span className="truncate">{cat?.name ?? 'Uncategorized'}</span>
    </>
  );
  const cls =
    'inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2 whitespace-nowrap';
  return onClick ? (
    <button type="button" className={`${cls} hover:border-ink-3 hover:text-ink`} onClick={onClick} title={title ?? 'Change category'}>
      {body}
      <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" className="opacity-60">
        <path d="M1 3l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

const KIND_ORDER = ['productive', 'neutral', 'uncategorized', 'entertainment'] as const;
const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = {
  productive: 'Productive',
  neutral: 'Neutral',
  uncategorized: 'Uncategorized',
  entertainment: 'Entertainment',
};

/** Thin horizontal split: productive on the left, entertainment on the right. */
export function SplitBar({ kinds, height = 8 }: { kinds: KindTotals; height?: number }) {
  const total = KIND_ORDER.reduce((a, k) => a + kinds[k], 0);
  if (total === 0) return <div className="rounded-full bg-surface-2" style={{ height }} />;
  return (
    <div
      className="flex gap-[2px] overflow-hidden rounded-full"
      style={{ height }}
      role="img"
      aria-label={KIND_ORDER.filter((k) => kinds[k] > 0)
        .map((k) => `${KIND_LABEL[k]} ${formatDuration(kinds[k])}`)
        .join(', ')}
    >
      {KIND_ORDER.filter((k) => kinds[k] > 0).map((k) => (
        <div
          key={k}
          className={k === 'uncategorized' ? 'hatch' : ''}
          title={`${KIND_LABEL[k]}: ${formatDuration(kinds[k])}`}
          style={{
            flexGrow: kinds[k],
            flexBasis: 0,
            minWidth: 3,
            background: k === 'uncategorized' ? undefined : `var(--cat-${k})`,
          }}
        />
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-surface-2 ring-1 ring-line ring-inset'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

export function SunMark({ size = 18 }: { size?: number }) {
  // A gnomon casting a shadow across a dial: the product mark.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
      <path d="M12 12 L5.5 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="var(--sun)" />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-3">{children}</div>}
    </div>
  );
}
