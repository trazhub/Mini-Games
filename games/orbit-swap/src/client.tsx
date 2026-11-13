import type { GameClientProps } from '@minigamehub/game-core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createOrbitView, type OrbitView } from './renderer';
import type { OrbitFullState } from './types';

/**
 * React shell around the Phaser renderer: wires server events in, and keyboard/touch intents
 * out. It never computes positions or scores.
 */
export default function OrbitSwapClient(props: GameClientProps<OrbitFullState>) {
  const { state, me, spectator, players, send, subscribe, reportScores, reducedMotion, sfx } = props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<OrbitView | null>(null);
  const names = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.name])), [players]);
  const latest = useRef({ reportScores, sfx, reducedMotion, names, me });
  latest.current = { reportScores, sfx, reducedMotion, names, me };

  // Create the Phaser view once per match.
  useEffect(() => {
    if (!host.current) return;
    const v = createOrbitView({
      parent: host.current,
      me: latest.current.me,
      names: latest.current.names,
      reducedMotion: latest.current.reducedMotion,
      onScores: (s) => latest.current.reportScores(s),
      onSfx: (n) => latest.current.sfx(n),
    });
    view.current = v;
    const off = subscribe((e) => v.onEvent(e));
    return () => {
      off();
      v.destroy();
      view.current = null;
    };
    // Recreated only when the match changes (component is keyed by matchId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state) view.current?.setFull(state);
  }, [state]);

  const swap = useCallback((d: 1 | -1) => !spectator && send({ type: 'swap', d }), [send, spectator]);
  const flip = useCallback(() => !spectator && send({ type: 'flip' }), [send, spectator]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') swap(1);
      else if (k === 'arrowdown' || k === 's') swap(-1);
      else if (k === ' ' || k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd') flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swap, flip]);

  const btn = 'btn touch-game min-h-16 flex-1 flex-col gap-0.5 rounded-3xl text-base';
  return (
    <div className="flex flex-col gap-3" data-testid="orbit-swap">
      <div ref={host} className="touch-game mx-auto aspect-square w-full max-w-[min(100%,34rem,calc(100dvh-16rem))] overflow-hidden rounded-3xl bg-midnight" aria-label="Orbit Swap play field" role="img" />
      {spectator ? (
        <p className="text-center text-sm text-mist">You are watching this match.</p>
      ) : (
        <div className="mx-auto flex w-full max-w-md gap-3" role="group" aria-label="Controls">
          <button type="button" className={`${btn} btn-soft`} onPointerDown={(e) => { e.preventDefault(); swap(-1); }} data-testid="orbit-inner">
            <span aria-hidden="true">↓</span>Inner
          </button>
          <button type="button" className={`${btn} btn-primary`} onPointerDown={(e) => { e.preventDefault(); flip(); }} data-testid="orbit-flip">
            <span aria-hidden="true">⟲</span>Reverse
          </button>
          <button type="button" className={`${btn} btn-soft`} onPointerDown={(e) => { e.preventDefault(); swap(1); }} data-testid="orbit-outer">
            <span aria-hidden="true">↑</span>Outer
          </button>
        </div>
      )}
    </div>
  );
}
