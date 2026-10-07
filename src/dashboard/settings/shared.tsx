import type { ReactNode } from 'react';

export function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl bg-surface p-5 ring-1 ring-line md:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 max-w-2xl text-sm text-ink-3">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 max-w-xl text-sm text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const inputCls = 'rounded-lg bg-surface px-2.5 py-1.5 text-sm ring-1 ring-line ring-inset focus:ring-ink-3 focus:outline-none';
export const selectCls = `${inputCls} pr-7`;

/** Save text as a file via a temporary link (no downloads permission needed). */
export function downloadFile(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tell the service worker to forget the in-progress session (before a wipe or import). */
export async function discardOpenSession(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'discard-open' });
  } catch {
    /* worker asleep with nothing open */
  }
}
