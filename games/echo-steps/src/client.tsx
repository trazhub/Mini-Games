import type { GameClientProps, SfxName } from '@minigamehub/game-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EchoState } from './types';

const PADS = [
  { label: 'Up', key: ['arrowup', 'w', '1'], color: '#3ddbb0', area: 'col-start-2 row-start-1' },
  { label: 'Right', key: ['arrowright', 'd', '2'], color: '#8b7cff', area: 'col-start-3 row-start-2' },
  { label: 'Down', key: ['arrowdown', 's', '3'], color: '#ffb547', area: 'col-start-2 row-start-3' },
  { label: 'Left', key: ['arrowleft', 'a', '4'], color: '#ff6b5e', area: 'col-start-1 row-start-2' },
] as const;

export default function EchoStepsClient(props: GameClientProps<EchoState>) {
  const { state, me, spectator, players, send, serverNow, reportScores, sfx, reducedMotion } = props;
  const [lit, setLit] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ pad: number; ok: boolean } | null>(null);
  const [now, setNow] = useState(0);
  const [localProgress, setLocalProgress] = useState(0);
  /** Set the instant the server rejects one of my pads (before the round formally ends). */
  const [wrong, setWrong] = useState(false);
  const lastStep = useRef(-1);
  /** Server-synced moment the input window opened (for the countdown bar). */
  const inputStart = useRef(0);
  const me_ = state?.players[me];
  const canInput = !spectator && state?.phase === 'input' && me_?.status === 'active' && !me_.done && !wrong;

  useEffect(() => {
    if (state) reportScores(state.scores);
  }, [state?.scores, state, reportScores]);

  // Keep a lightweight clock for countdown bars and sequence playback.
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 50);
    return () => clearInterval(id);
  }, [serverNow]);

  useEffect(() => {
    if (state?.phase === 'input') inputStart.current = serverNow();
  }, [state?.phase, state?.round, serverNow]);

  // Reset per-round local state.
  useEffect(() => {
    setLocalProgress(0);
    setWrong(false);
    setFlash(null);
    lastStep.current = -1;
  }, [state?.round]);

  // Play the sequence in the watch phase, driven purely by server-provided timing.
  useEffect(() => {
    if (!state || state.phase !== 'watch' || !state.sequence) return setLit(null);
    const idx = Math.floor((now - state.showStartsAt) / state.stepMs);
    const into = (now - state.showStartsAt) - idx * state.stepMs;
    if (idx >= 0 && idx < state.sequence.length && into < state.stepMs * 0.72) {
      setLit(state.sequence[idx]!);
      if (lastStep.current !== idx) {
        lastStep.current = idx;
        sfx(`pad${state.sequence[idx]!}` as SfxName);
      }
    } else setLit(null);
  }, [now, state, sfx]);

  // Server feedback for my own presses.
  useEffect(
    () =>
      props.subscribe((e) => {
        if (e.type === 'pad') {
          const ok = !!e.ok;
          setLocalProgress(Number(e.progress ?? 0));
          if (!ok) {
            setWrong(true);
            sfx('bad');
          }
          else if (e.done) sfx('good');
        }
      }),
    [props, sfx],
  );

  const press = useCallback(
    (pad: number) => {
      if (!canInput) return;
      send({ type: 'pad', pad });
      sfx(`pad${pad}` as SfxName);
      setFlash({ pad, ok: true });
      setTimeout(() => setFlash((f) => (f?.pad === pad ? null : f)), 140);
    },
    [canInput, send, sfx],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const i = PADS.findIndex((p) => (p.key as readonly string[]).includes(k));
      if (i >= 0) {
        e.preventDefault();
        press(i);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const nameOf = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  if (!state) return <div className="flex h-96 items-center justify-center text-mist">Getting the pads ready…</div>;

  const progress = Math.max(localProgress, me_?.progress ?? 0);
  const budget = Math.max(1, state.endsAt - inputStart.current);
  const leftMs = Math.max(0, state.endsAt - now);
  const pct = state.phase === 'input' ? Math.min(100, (leftMs / budget) * 100) : 0;

  const headline =
    state.phase === 'intro'
      ? 'Watch the pads, then echo the pattern'
      : state.phase === 'watch'
        ? 'Watch…'
        : state.phase === 'input'
          ? me_?.status === 'out' || wrong
            ? 'Wrong pad - you are out'
            : me_?.done
              ? 'Pattern complete!'
              : spectator
                ? 'Players are echoing'
                : 'Your turn!'
          : state.phase === 'result'
            ? 'Round complete'
            : 'Game over';

  return (
    <div className="flex flex-col items-center gap-4 p-2 sm:p-4" data-testid="echo-steps" data-phase={state.phase}>
      <div className="flex w-full items-center justify-between text-sm text-mist">
        <span>Round {Math.max(1, state.round)} of {state.maxRounds} · {state.length || 3} steps</span>
        {me_?.status === 'out' && <span className="rounded-full bg-coral/15 px-3 py-1 text-xs font-semibold text-coral">Eliminated</span>}
      </div>
      <h2 className="font-display text-3xl font-extrabold sm:text-4xl" aria-live="polite" data-testid="echo-headline">{headline}</h2>

      <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-midnight" aria-hidden="true">
        <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%`, transition: 'width .1s linear' }} />
      </div>

      <div className="touch-game grid w-full max-w-sm grid-cols-3 grid-rows-3 gap-3" role="group" aria-label="Pads">
        {PADS.map((p, i) => {
          const on = lit === i || flash?.pad === i;
          return (
            <button
              key={p.label}
              type="button"
              className={`${p.area} aspect-square rounded-3xl text-lg font-bold transition disabled:cursor-default`}
              style={{ background: on ? p.color : `${p.color}33`, boxShadow: on && !reducedMotion ? `0 0 34px ${p.color}` : 'none', color: on ? '#0b1226' : p.color, border: `3px solid ${p.color}` }}
              aria-label={`${p.label} pad`}
              disabled={!canInput}
              onPointerDown={(e) => {
                e.preventDefault();
                press(i);
              }}
              data-testid={`pad-${i}`}
            >
              {i + 1}
            </button>
          );
        })}
        <div className="col-start-2 row-start-2 flex items-center justify-center text-center font-display text-2xl font-extrabold text-mist" aria-hidden="true">
          {state.phase === 'input' ? `${progress}/${state.length}` : state.phase === 'watch' ? '👀' : ''}
        </div>
      </div>

      <ul className="grid w-full max-w-xl gap-1.5 sm:grid-cols-2" aria-label="Player progress">
        {props.participantIds.map((id) => {
          const ps = state.players[id];
          if (!ps) return null;
          const frac = state.phase === 'input' || state.phase === 'result' ? (ps.done ? 1 : ps.progress / Math.max(1, state.length)) : 0;
          return (
            <li key={id} className={`flex items-center gap-2 rounded-xl bg-midnight px-3 py-1.5 text-xs ring-1 ${id === me ? 'ring-pulse' : 'ring-edge'} ${ps.status === 'out' ? 'opacity-50' : ''}`}>
              <span className="w-24 truncate font-medium">{nameOf[id] ?? 'Player'}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate"><span className="block h-full rounded-full bg-mint" style={{ width: `${frac * 100}%`, transition: 'width .15s' }} /></span>
              <span className="w-14 text-right text-mist">{ps.status === 'out' ? 'out' : ps.done ? 'done' : ''}</span>
            </li>
          );
        })}
      </ul>

      {state.phase === 'result' && state.roundResults && (
        <ul className="w-full max-w-xl space-y-1 text-sm">
          {state.roundResults.map((r) => (
            <li key={r.playerId} className="flex justify-between rounded-lg bg-slate px-3 py-1.5">
              <span>{nameOf[r.playerId] ?? 'Player'}</span>
              <span className={r.completed ? 'text-mint' : 'text-coral'}>{r.completed ? `+${r.points}` : 'eliminated'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
