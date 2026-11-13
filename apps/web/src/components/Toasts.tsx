import { useParty } from '../lib/party';

export function Toasts() {
  const { toasts, dismissToast } = useParty();
  if (toasts.length === 0) return null;
  const tone = { info: 'ring-pulse/50', warn: 'ring-amber/60', error: 'ring-coral/60' } as const;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start justify-between gap-3 rounded-2xl bg-hull px-4 py-3 text-sm shadow-lift ring-2 ${tone[t.level]}`} style={{ animation: 'pop .18s ease-out' }}>
          <span>{t.message}</span>
          <button type="button" className="-mr-1 rounded-lg px-2 text-mist hover:text-chalk" onClick={() => dismissToast(t.id)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
