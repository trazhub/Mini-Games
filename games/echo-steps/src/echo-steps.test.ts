import { GameHarness } from '@minigamehub/game-core';
import { describe, expect, it } from 'vitest';
import { echoStepsPlugin } from './server';
import type { EchoState } from './types';

const fast = {
  introMs: 100,
  watchLeadMs: 100,
  stepMs: 100,
  inputBaseMs: 1000,
  inputPerStepMs: 200,
  latencyGraceMs: 200,
  resultMs: 200,
  maxRounds: 4,
};

const state = (h: GameHarness, id = 'p1') => h.instance.getState(id) as EchoState;

/** Advance until the phase matches; returns the state. */
function toPhase(h: GameHarness, phase: EchoState['phase'], limitMs = 20000): EchoState {
  let waited = 0;
  while (state(h).phase !== phase && waited < limitMs) {
    h.advance(33);
    waited += 33;
  }
  return state(h);
}

/** Read the sequence during watch then advance to the input phase. */
function watchThenInput(h: GameHarness): number[] {
  const s = toPhase(h, 'watch');
  const seq = s.sequence!;
  toPhase(h, 'input');
  return seq;
}

describe('echo-steps', () => {
  it('generates a server-side sequence that grows each round and hides it during input', () => {
    const h = new GameHarness(echoStepsPlugin, 2, fast, 7);
    h.instance.start();
    const seq1 = watchThenInput(h);
    expect(seq1).toHaveLength(3);
    expect(state(h).sequence).toBeNull(); // hidden while inputting
    expect(state(h).phase).toBe('input');
    for (const p of ['p1', 'p2']) for (const pad of seq1) h.instance.handleAction(p, { type: 'pad', pad });
    toPhase(h, 'watch');
    const seq2 = state(h).sequence!;
    expect(seq2).toHaveLength(4);
    expect(seq2.slice(0, 3)).toEqual(seq1);
  });

  it('rejects pads outside the input phase and invalid pad values', () => {
    const h = new GameHarness(echoStepsPlugin, 2, fast);
    h.instance.start();
    h.instance.handleAction('p1', { type: 'pad', pad: 0 });
    toPhase(h, 'watch');
    h.instance.handleAction('p1', { type: 'pad', pad: 0 });
    expect(h.events('rejected').map((e) => e.payload?.reason)).toEqual(['not-input-phase', 'not-input-phase']);
    toPhase(h, 'input');
    for (const bad of [-1, 4, 1.5, NaN as number]) h.instance.handleAction('p1', { type: 'pad', pad: bad });
    h.instance.handleAction('p1', { type: 'pad', pad: 'x' as any });
    expect(h.events('rejected').slice(2).every((e) => e.payload?.reason === 'invalid')).toBe(true);
    expect(state(h).players.p1!.progress).toBe(0);
    expect(state(h).players.p1!.status).toBe('active');
  });

  it('validates every step on the server and eliminates on a wrong pad', () => {
    const h = new GameHarness(echoStepsPlugin, 2, fast, 3);
    h.instance.start();
    const seq = watchThenInput(h);
    const wrong = (seq[0]! + 1) % 4;
    h.instance.handleAction('p1', { type: 'pad', pad: wrong });
    expect(h.events('pad').at(-1)?.payload).toMatchObject({ ok: false });
    for (const pad of seq) h.instance.handleAction('p2', { type: 'pad', pad });
    toPhase(h, 'result');
    const s = state(h);
    expect(s.players.p1!.status).toBe('out');
    expect(s.players.p2!.status).toBe('active');
    expect(s.roundResults!.find((r) => r.playerId === 'p1')).toMatchObject({ completed: false, points: 0 });
    expect(s.roundResults!.find((r) => r.playerId === 'p2')!.points).toBeGreaterThanOrEqual(100);
  });

  it('times out slow players using the server clock (client timestamps are never read)', () => {
    const h = new GameHarness(echoStepsPlugin, 3, fast, 5);
    h.instance.start();
    const seq = watchThenInput(h);
    for (const pad of seq) h.instance.handleAction('p1', { type: 'pad', pad });
    for (const pad of seq) h.instance.handleAction('p2', { type: 'pad', pad });
    // p3 does nothing -> eliminated at the deadline + grace
    toPhase(h, 'result');
    expect(state(h).players.p3!.status).toBe('out');
    expect(state(h).players.p1!.status).toBe('active');
  });

  it('accepts late input inside the latency grace window but not after', () => {
    const h = new GameHarness(echoStepsPlugin, 2, { ...fast, latencyGraceMs: 300 }, 11);
    h.instance.start();
    const seq = watchThenInput(h);
    const budget = fast.inputBaseMs + seq.length * fast.inputPerStepMs; // displayed deadline
    h.advance(budget + 100); // after displayed deadline, still inside grace
    expect(state(h).phase).toBe('input');
    for (const pad of seq) h.instance.handleAction('p1', { type: 'pad', pad });
    expect(state(h).players.p1!.done).toBe(true);
    h.advance(400);
    h.instance.handleAction('p2', { type: 'pad', pad: seq[0]! });
    // p2 never finished: eliminated, and a late pad changes nothing
    expect(state(h).players.p2).toMatchObject({ status: 'out', progress: 0 });
    expect(h.events('pad').filter((e) => e.to === 'p2')).toHaveLength(0);
  });

  it('ends with a survivor bonus when one player is left and ranks by score', () => {
    const h = new GameHarness(echoStepsPlugin, 2, fast, 9);
    h.instance.start();
    const seq = watchThenInput(h);
    h.instance.handleAction('p1', { type: 'pad', pad: (seq[0]! + 1) % 4 }); // p1 out
    for (const pad of seq) h.instance.handleAction('p2', { type: 'pad', pad });
    for (let i = 0; i < 400 && !h.result; i++) h.advance(33);
    expect(h.result).not.toBeNull();
    const scores = Object.fromEntries(h.result!.scores.map((s) => [s.playerId, s.score]));
    expect(scores.p1).toBe(0);
    expect(scores.p2).toBeGreaterThanOrEqual(150); // round points + survivor bonus 50
  });

  it('ends when everybody is eliminated and treats disconnects as eliminations', () => {
    const h = new GameHarness(echoStepsPlugin, 2, fast, 2);
    h.instance.start();
    watchThenInput(h);
    h.connected.clear();
    for (let i = 0; i < 400 && !h.result; i++) h.advance(33);
    expect(h.result).not.toBeNull();
    expect(h.result!.scores.every((s) => s.score === 0)).toBe(true);
  });

  it('plays through maxRounds when everyone keeps succeeding', () => {
    const h = new GameHarness(echoStepsPlugin, 2, { ...fast, maxRounds: 3 }, 4);
    h.instance.start();
    for (let round = 1; round <= 3; round++) {
      const seq = watchThenInput(h);
      for (const p of ['p1', 'p2']) for (const pad of seq) h.instance.handleAction(p, { type: 'pad', pad });
      toPhase(h, 'result');
      h.advance(300);
    }
    expect(h.result).not.toBeNull();
    const finals = h.result!.scores;
    expect(finals[0]!.score).toBeGreaterThan(300);
    expect(h.result!.summary).toMatchObject({ roundsPlayed: 3 });
  });
});
