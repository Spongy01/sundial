import type { RangePreset } from '../../core/range';

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'custom', label: 'Custom' },
];

export function RangeSwitcher({
  preset,
  custom,
  today,
  onChange,
}: {
  preset: RangePreset;
  custom: { from: string; to: string };
  today: string;
  onChange: (preset: RangePreset, custom?: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Date range" className="flex rounded-lg bg-surface-2 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => onChange(p.id)}
            className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap ${
              preset === p.id ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            aria-label="From"
            value={custom.from}
            max={today}
            onChange={(e) => e.target.value && onChange('custom', { ...custom, from: e.target.value })}
            className="rounded-md bg-surface px-2 py-1 ring-1 ring-line"
          />
          <span className="text-ink-3">to</span>
          <input
            type="date"
            aria-label="To"
            value={custom.to}
            max={today}
            onChange={(e) => e.target.value && onChange('custom', { ...custom, to: e.target.value })}
            className="rounded-md bg-surface px-2 py-1 ring-1 ring-line"
          />
        </div>
      )}
    </div>
  );
}
