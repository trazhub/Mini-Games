import { GameHarness } from '@minigamehub/game-core';
import { describe, expect, it } from 'vitest';
import { POINTS, scoreRound, type Submission } from './scoring';
import { defaultConfig, majorityTrapPlugin } from './server';

const sub = (answer: 'A' | 'B', predict: 'A' | 'B'): Submission => ({ answer, predict });

describe('majority-trap scoring', () => {
  it('awards prediction + lone wolf points deterministically', () => {
    const out = scoreRound(
      new Map([
        ['a', sub('A', 'B')], // picks the majority, predicts B is minority -> wrong? A has 3, B has 1 => minority B => correct
        ['b', sub('A', 'A')],
        ['c', sub('A', 'B')],
        ['d', sub('B', 'B')], // lone wolf + correct prediction
      ]),
    );
    expect(out.counts).toEqual({ A: 3, B: 1 });
    expect(out.minority).toBe('B');
    const pts = Object.fromEntries(out.rows.map((r) => [r.playerId, r.points]));
    expect(pts).toEqual({
      a: POINTS.correctPrediction,
      b: 0,
      c: POINTS.correctPrediction,
      d: POINTS.correctPrediction + POINTS.loneWolf,
    });
  });

  it('handles tied votes: no minority, everyone gets the consolation', () => {
    const out = scoreRound(new Map([['a', sub('A', 'A')], ['b', sub('B', 'A')]]));
    expect(out.tie).toBe(true);
    expect(out.minority).toBeNull();
    expect(out.rows.map((r) => r.points)).toEqual([POINTS.tiePrediction, POINTS.tiePrediction]);
  });

  it('handles nobody answering as a tie with no rows', () => {
    const out = scoreRound(new Map());
    expect(out.tie).toBe(true);
    expect(out.rows).toEqual([]);
  });
});

const fast = { rounds: 3, introMs: 100, answerMs: 1000, revealMs: 200, latencyGraceMs: 100 };

describe('majority-trap game flow', () => {
  it('keeps answers private until the reveal', () => {
    const h = new GameHarness(majorityTrapPlugin, 3, fast);
    h.instance.start();
    h.advance(150);
    h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' });
    const own = h.instance.getState('p1') as any;
    const other = h.instance.getState('p2') as any;
    const spectator = h.instance.getState(null) as any;
    expect(own.mine).toEqual({ answer: 'A', predict: 'B' });
    expect(other.mine).toBeNull();
    expect(spectator.mine).toBeNull();
    expect(other.submitted).toEqual(['p1']);
    expect(JSON.stringify(other)).not.toContain('"predict"');
    expect(other.reveal).toBeNull();
  });

  it('rejects duplicate, malformed, late and non-participant actions', () => {
    const h = new GameHarness(majorityTrapPlugin, 3, fast);
    h.instance.start();
    h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' }); // intro: too early
    expect(h.events('rejected')).toHaveLength(1);
    h.advance(150);
    h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' });
    h.instance.handleAction('p1', { type: 'answer', answer: 'B', predict: 'A' }); // duplicate
    h.instance.handleAction('p2', { type: 'answer', answer: 'C', predict: 'A' }); // invalid
    h.instance.handleAction('p2', { type: 'answer', answer: 'A' } as any); // missing predict
    h.instance.handleAction('ghost', { type: 'answer', answer: 'A', predict: 'B' }); // not a participant
    const reasons = h.events('rejected').map((e) => e.payload?.reason);
    expect(reasons).toEqual(['not-accepting', 'already-submitted', 'invalid', 'invalid']);
    expect((h.instance.getState('p1') as any).submitted).toEqual(['p1']);
  });

  it('reveals early when every connected player has answered, and ignores disconnected ones', () => {
    const h = new GameHarness(majorityTrapPlugin, 3, fast);
    h.instance.start();
    h.advance(150);
    h.connected.delete('p3');
    h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' });
    h.instance.handleAction('p2', { type: 'answer', answer: 'B', predict: 'B' });
    h.advance(50);
    expect((h.instance.getState('p1') as any).phase).toBe('reveal');
  });

  it('enforces the server timer (no answers after the deadline) and awards 0 for non-responders', () => {
    const h = new GameHarness(majorityTrapPlugin, 3, fast);
    h.instance.start();
    h.advance(150);
    h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' });
    h.advance(1200); // answerMs + grace passed -> reveal
    const s = h.instance.getState('p2') as any;
    expect(s.phase).toBe('reveal');
    h.instance.handleAction('p2', { type: 'answer', answer: 'B', predict: 'A' });
    expect(h.events('rejected').at(-1)?.payload?.reason).toBe('not-accepting');
    expect(s.scores.p2).toBe(0);
    expect(s.reveal.rows.map((r: any) => r.playerId)).toEqual(['p1']);
  });

  it('plays all rounds, finishes with ranked scores and a winner', () => {
    const h = new GameHarness(majorityTrapPlugin, 4, { ...fast, rounds: 3 });
    h.instance.start();
    for (let r = 0; r < 3; r++) {
      h.advance(150 + (r > 0 ? 100 : 0));
      // p1 always answers A and predicts B; others answer B.
      h.instance.handleAction('p1', { type: 'answer', answer: 'A', predict: 'B' });
      for (const p of ['p2', 'p3', 'p4']) h.instance.handleAction(p, { type: 'answer', answer: 'B', predict: 'A' });
      h.advance(60);
      h.advance(300);
    }
    h.advance(500);
    expect(h.result).not.toBeNull();
    const scores = Object.fromEntries(h.result!.scores.map((s) => [s.playerId, s.score]));
    // p1 is always the lone minority answer (+50) but predicts wrongly; the others predict the minority (+100)
    expect(scores.p1).toBe(150);
    expect(scores.p2).toBe(300);
    expect(h.result!.scores.find((x) => x.playerId === "p1")!.score).toBeLessThan(scores.p2!);
    expect(h.instance.getState('p1')).toMatchObject({ phase: 'done' });
  });

  it('uses the documented default config', () => {
    expect(defaultConfig.rounds).toBe(5);
    expect(majorityTrapPlugin.meta.minPlayers).toBe(3);
    expect(majorityTrapPlugin.meta.maxPlayers).toBe(12);
  });
});
