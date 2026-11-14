import type { GameClientProps } from '@minigamehub/game-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Choice } from './scoring';
import type { MajorityState } from './types';

const COLORS = { A: '#ff8c7e', B: '#f8cf46' } as const;

function useCountdown(endsAt: number, serverNow: () => number, active: boolean): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setLeft(Math.max(0, endsAt - serverNow()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt, serverNow, active]);
  return left;
}

export default function MajorityTrapClient(props: GameClientProps<MajorityState>) {
  const { state, me, spectator, players, send, serverNow, reportScores, sfx } = props;
  const [answer, setAnswer] = useState<Choice | null>(null);
  const [predict, setPredict] = useState<Choice | null>(null);
  const round = state?.round ?? 0;
  const phase = state?.phase ?? 'intro';
  const left = useCountdown(state?.endsAt ?? 0, serverNow, !!state && phase !== 'done');
  const nameOf = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const lastSfxRound = useRef(0);

  useEffect(() => {
    setAnswer(null);
    setPredict(null);
  }, [round]);
  useEffect(() => {
    if (state) reportScores(state.scores);
  }, [state?.scores, state, reportScores]);

  // Sound cue when the reveal lands for my row.
  useEffect(() => {
    if (state?.phase === 'reveal' && state.reveal && lastSfxRound.current !== state.round) {
      lastSfxRound.current = state.round;
      const mine = state.reveal.rows.find((r) => r.playerId === me);
      if (mine) sfx(mine.points > 0 ? 'good' : 'bad');
    }
  }, [state, me, sfx]);

  const locked = !!state?.mine;
  const canAct = !spectator && phase === 'question' && !locked;
  const submit = useCallback(() => {
    if (!canAct || !answer || !predict) return;
    send({ type: 'answer', answer, predict });
    sfx('tap');
  }, [canAct, answer, predict, send, sfx]);

  // Keyboard: A/B = answer, Shift+A/B = prediction, Enter = lock in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'b') {
        const c = k.toUpperCase() as Choice;
        if (e.shiftKey) setPredict(c);
        else setAnswer(c);
        e.preventDefault();
      } else if (k === 'enter') {
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  if (!state) return <div className="flex h-96 items-center justify-center text-mist">Waiting for the first question…</div>;

  const total = Math.max(1, state.phase === 'reveal' ? 7000 : 15000);
  const pct = Math.min(100, (left / total) * 100);
  const connectedPlayers = players.filter((p) => props.participantIds.includes(p.id));

  if (phase === 'intro') {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
        <p className="font-display text-5xl font-extrabold sm:text-6xl">Majority Trap</p>
        <p className="max-w-md text-mist">Pick your answer. Then predict which answer the group will pick <em>less</em>. {state.totalRounds} rounds.</p>
      </div>
    );
  }

  if (phase === 'done') {
    return <div className="flex h-96 items-center justify-center font-display text-3xl font-extrabold">Counting the votes…</div>;
  }

  const q = state.question!;
  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4" data-testid="majority-trap" data-phase={phase}>
      <div className="flex items-center justify-between text-sm text-mist">
        <span>Round {state.round} of {state.totalRounds}</span>
        <span aria-live="off" className="tabular-nums">{phase === 'question' ? `${Math.ceil(left / 1000)}s` : 'Results'}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-midnight" role="progressbar" aria-label="Time left" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-pulse transition-[width] duration-100" style={{ width: `${pct}%` }} />
      </div>

      <h2 className="text-balance text-center font-display text-3xl font-extrabold sm:text-4xl" data-testid="mt-question">{q.text}</h2>

      {phase === 'question' && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={!canAct}>
            <legend className="mb-2 text-center text-sm font-semibold text-mist">1. Which answer do you pick?</legend>
            {(['A', 'B'] as const).map((c) => {
              const on = (locked ? state.mine!.answer : answer) === c;
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => { setAnswer(c); sfx('tap'); }} data-testid={`answer-${c}`} className="touch-game answer-panel p-5 text-left ring-2 transition disabled:cursor-default" style={{ background: COLORS[c], color: '#202724', ['--tw-ring-color' as string]: on ? '#fffaf2' : COLORS[c] }}>
                  <span className="answer-letter font-display font-extrabold">{c}<span className="answer-check" aria-hidden="true">{on ? '✓' : '↗'}</span></span>
                  <span className="mt-1 block text-lg font-semibold">{c === 'A' ? q.a : q.b}</span>
                </button>
              );
            })}
          </fieldset>

          <fieldset className="rounded-3xl bg-midnight p-4 ring-1 ring-edge" disabled={!canAct}>
            <legend className="px-2 text-center text-sm font-semibold text-mist">2. Which answer will be LESS popular?</legend>
            <div className="mt-1 grid grid-cols-2 gap-3">
              {(['A', 'B'] as const).map((c) => {
                const on = (locked ? state.mine!.predict : predict) === c;
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => { setPredict(c); sfx('tap'); }} data-testid={`predict-${c}`} className="btn touch-game justify-center ring-2 ring-edge" style={on ? { background: COLORS[c], color: '#0b1226', ['--tw-ring-color' as string]: COLORS[c] } : { background: '#151b30' }}>
                    Less popular: {c}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {spectator ? (
            <p className="text-center text-sm text-mist">You are watching this match.</p>
          ) : locked ? (
            <p className="text-center text-mint" role="status" data-testid="mt-locked">
              Locked in. Waiting for {Math.max(0, connectedPlayers.filter((p) => p.connected).length - state.submitted.length)} more…
            </p>
          ) : (
            <button type="button" className="btn btn-primary w-full text-base" disabled={!answer || !predict} onClick={submit} data-testid="mt-lock">
              {answer && predict ? 'Lock in answers' : 'Choose an answer and a prediction'}
            </button>
          )}

          <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Who has answered">
            {connectedPlayers.map((p) => (
              <li key={p.id} className={`rounded-full px-2.5 py-1 text-xs ring-1 ${state.submitted.includes(p.id) ? 'bg-mint/15 text-mint ring-mint/40' : 'bg-midnight text-mist ring-edge'}`}>
                {p.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {phase === 'reveal' && state.reveal && (
        <>
          <div className="grid grid-cols-2 gap-3" data-testid="mt-reveal">
            {(['A', 'B'] as const).map((c) => {
              const n = state.reveal!.counts[c];
              const total = Math.max(1, state.reveal!.counts.A + state.reveal!.counts.B);
              const isMin = state.reveal!.minority === c;
              return (
                <div key={c} className="rounded-3xl bg-midnight p-4 ring-2" style={{ ['--tw-ring-color' as string]: isMin ? COLORS[c] : '#2b3558' }}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl font-extrabold" style={{ color: COLORS[c] }}>{c}</span>
                    <span className="font-display text-3xl font-extrabold tabular-nums">{n}</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate"><div className="h-full rounded-full" style={{ width: `${(n / total) * 100}%`, background: COLORS[c], transition: 'width .5s' }} /></div>
                  {isMin && <p className="mt-2 text-sm font-semibold" style={{ color: COLORS[c] }}>The minority</p>}
                </div>
              );
            })}
          </div>
          {state.reveal.tie && <p className="text-center text-amber">Tied vote: nobody is the minority, every prediction earns a consolation.</p>}
          <ul className="space-y-1.5">
            {state.reveal.rows.map((r) => (
              <li key={r.playerId} className={`flex items-center gap-3 rounded-xl bg-midnight px-3 py-2 text-sm ring-1 ${r.playerId === me ? 'ring-pulse' : 'ring-edge'}`}>
                <span className="min-w-0 flex-1 truncate font-medium">{nameOf[r.playerId]?.name ?? 'Player'}</span>
                <span className="text-mist">picked <b style={{ color: COLORS[r.answer] }}>{r.answer}</b>, predicted <b style={{ color: COLORS[r.predict] }}>{r.predict}</b> less popular</span>
                <span className={`w-14 text-right font-display text-lg font-extrabold tabular-nums ${r.points ? 'text-mint' : 'text-mist'}`}>+{r.points}</span>
              </li>
            ))}
            {connectedPlayers.filter((p) => !state.reveal!.rows.some((r) => r.playerId === p.id)).map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-midnight/60 px-3 py-2 text-sm text-mist ring-1 ring-edge/60">
                <span>{p.name}</span><span>no answer</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
