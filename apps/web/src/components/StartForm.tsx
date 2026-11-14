import { LIMITS, normalizeRoomCode, sanitizeNickname, type AvatarId } from '@minigamehub/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_BY_ID } from '../games/registry';
import { fetchRoomInfo } from '../lib/api';
import { unlockAudio } from '../lib/audio';
import { useParty } from '../lib/party';
import { getProfile, saveProfile } from '../lib/storage';
import { AvatarPicker } from './AvatarPicker';

type Mode = 'create' | 'join';

export function StartForm({
  initialMode = 'create',
  initialCode = '',
  game,
  onCodeChange,
  compact = false,
}: {
  initialMode?: Mode;
  initialCode?: string;
  game?: string | null;
  onCodeChange?: (code: string, mode: Mode) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { create, join, status } = useParty();
  const [profile] = useState(getProfile);
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const nickId = useId();
  const codeId = useId();
  const modeId = useId();
  const selected = game ? GAME_BY_ID[game] : undefined;
  const nickRef = useRef<HTMLInputElement>(null);

  useEffect(() => onCodeChange?.(code, mode), [code, mode, onCodeChange]);

  // Live room preview once a full code is typed.
  useEffect(() => {
    setPreview(null);
    const normalized = normalizeRoomCode(code);
    if (mode !== 'join' || !normalized) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const info = await fetchRoomInfo(normalized);
      if (cancelled) return;
      if (!info) setPreview('Could not check that code right now. You can still try joining.');
      else if (!info.exists) setPreview('No party with that code. Check it with whoever invited you.');
      else if (!info.joinable) setPreview(`Party ${normalized} is full (${info.players}/${info.capacity}).`);
      else setPreview(`Party ${normalized}: ${info.players} of ${info.capacity} players, ${info.phase === 'playing' ? 'a game is running (you can watch until it ends)' : 'in the lobby'}.`);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, mode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = sanitizeNickname(nickname);
    if (!clean) {
      setError(`Pick a nickname with ${LIMITS.NICK_MIN}-${LIMITS.NICK_MAX} characters.`);
      nickRef.current?.focus();
      return;
    }
    let target: string | null = null;
    if (mode === 'join') {
      target = normalizeRoomCode(code);
      if (!target) {
        setError(`Room codes have ${LIMITS.ROOM_CODE_LENGTH} letters and numbers.`);
        return;
      }
    }
    unlockAudio();
    saveProfile({ nickname: clean, avatar });
    setBusy(true);
    try {
      if (mode === 'create') {
        const roomCode = await create();
        navigate(`/room/${roomCode}`, { state: { game: selected?.meta.id ?? null } });
      } else {
        await join(target!);
        navigate(`/room/${target}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const connecting = busy || status === 'connecting';
  return (
    <form onSubmit={submit} className={`start-form panel space-y-4 ${compact ? 'p-5' : 'p-6'}`} noValidate aria-label="Start playing">
      <div role="tablist" aria-label="Create or join" className="grid grid-cols-2 gap-1 rounded-2xl bg-midnight p-1">
        {(['create', 'join'] as const).map((m) => (
          <button key={m} id={`${modeId}-${m}`} type="button" role="tab" aria-controls={`${modeId}-panel`} aria-selected={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => setMode(m)} onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === 'Home' ? 'create' : e.key === 'End' ? 'join' : m === 'create' ? 'join' : 'create';
            setMode(next);
            document.getElementById(`${modeId}-${next}`)?.focus();
          }} className={`min-h-10 rounded-xl text-sm font-semibold transition ${mode === m ? 'bg-hull text-chalk shadow-sm' : 'text-mist hover:text-chalk'}`}>
            {m === 'create' ? 'Create a room' : 'Join with a code'}
          </button>
        ))}
      </div>

      <div id={`${modeId}-panel`} role="tabpanel" aria-labelledby={`${modeId}-${mode}`} className="space-y-4">

      {selected && mode === 'create' && (
        <p className="rounded-xl bg-hull px-3 py-2 text-sm text-mist ring-1 ring-edge">
          Your room will start with <strong className="text-chalk">{selected.meta.name}</strong> selected.
        </p>
      )}

      <div>
        <label htmlFor={nickId} className="mb-1.5 block text-sm font-medium">
          Nickname
        </label>
        <input id={nickId} ref={nickRef} className="field" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={LIMITS.NICK_MAX + 8} autoComplete="nickname" placeholder="What should friends call you?" aria-describedby={error ? `${nickId}-err` : undefined} />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium">Avatar</span>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>

      {mode === 'join' && (
        <div>
          <label htmlFor={codeId} className="mb-1.5 block text-sm font-medium">
            Room code
          </label>
          <input id={codeId} className="field text-center font-display text-2xl font-extrabold tracking-[0.35em] uppercase" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, LIMITS.ROOM_CODE_LENGTH).toUpperCase())} placeholder="ABCDE" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby={`${codeId}-hint`} />
          <p id={`${codeId}-hint`} className="mt-1.5 min-h-5 text-sm text-mist" aria-live="polite">
            {preview ?? 'Ask the host for the code, or open their invite link.'}
          </p>
        </div>
      )}

      {error && (
        <p id={`${nickId}-err`} role="alert" className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral ring-1 ring-coral/40">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={connecting}>
        {connecting ? 'Connecting…' : mode === 'create' ? 'Create room' : 'Join room'}
      </button>
      </div>
    </form>
  );
}
