import { useId, useState, type FormEvent } from 'react';
import { ApiError, createRecoveryCode, ensureSession, restoreGuest } from '../lib/api';

function restoreMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404 || e.status === 400) return 'That code was not recognised. Check it and try again.';
    if (e.status === 501) return 'Recovery is not available on this server.';
  }
  return (e as Error).message || 'Could not restore. Try again.';
}

/**
 * Save-and-restore for the guest identity. Anyone holding the code can become this player, so the
 * card says so; the server stores only a hash and shows the code once.
 */
export function RecoveryCard({ onRestored }: { onRestored?: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [input, setInput] = useState('');
  const inputId = useId();

  async function create() {
    setBusy('create');
    setError(null);
    setCopied(false);
    try {
      const s = await ensureSession();
      setCode(await createRecoveryCode(s.token));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 501 ? 'Recovery is not available on this server.' : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Select the code and copy it by hand.');
    }
  }

  async function restore(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return setError('Paste your recovery code first.');
    setBusy('restore');
    setError(null);
    try {
      await restoreGuest(input.trim());
      setRestored(true);
      setInput('');
      setCode(null);
      onRestored?.();
    } catch (err) {
      setError(restoreMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-6" aria-labelledby="recovery-title" data-testid="recovery-card">
      <h2 id="recovery-title" className="text-xl font-bold">Keep your player</h2>
      <p className="mt-2 text-sm text-mist">
        Your guest identity lives in this browser. Save a recovery code to get your player (nickname history and personal bests) back on another device or after clearing your browser data.
      </p>

      {code ? (
        <div className="mt-4" role="group" aria-label="Your recovery code">
          <p className="text-sm font-semibold">Save this code</p>
          <p className="mt-1 break-all rounded-2xl bg-midnight px-4 py-3 font-mono text-lg tracking-wider ring-1 ring-edge" data-testid="recovery-code" tabIndex={0}>{code}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy code'}</button>
            <span role="status" className="text-sm text-mint">{copied ? 'Copied to the clipboard.' : ''}</span>
          </div>
          <p className="mt-3 text-sm text-mist">
            It is shown only once. <strong>Anyone who has this code can become this player</strong>, so keep it private. Making a new code replaces this one.
          </p>
        </div>
      ) : (
        <button type="button" className="btn btn-soft mt-4" disabled={busy !== null} onClick={() => void create()}>
          {busy === 'create' ? 'Making a code…' : 'Make a recovery code'}
        </button>
      )}

      <form onSubmit={restore} className="mt-6 border-t border-edge pt-5" noValidate>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">Restore a player</label>
        <div className="flex flex-wrap gap-2">
          <input id={inputId} className="field min-w-0 flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a recovery code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} />
          <button type="submit" className="btn btn-ink" disabled={busy !== null}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
        </div>
        <p className="mt-2 text-xs text-mist">This browser will become that player and leave any party it is in.</p>
      </form>

      {restored && <p role="status" className="mt-3 text-sm text-mint">Restored. This browser is now that player.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}
    </section>
  );
}
