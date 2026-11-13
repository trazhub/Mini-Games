import { ARCADE, type ArcadeChunk, type GameMeta } from '@minigamehub/shared';
import { describe, expect, it } from 'vitest';
import {
  ChunkAssembler,
  createArcadePlugin,
  decodeInputLog,
  encodeInputLog,
  splitChunks,
  type ArcadeSim,
  type InputEvent,
} from './arcade';
import { ArcadeRecorder } from './arcade-client';
import { GameHarness } from './testing';

const meta: GameMeta = {
  id: 'counter',
  name: 'Counter',
  tagline: 'Test double',
  description: 'Score = number of inputs.',
  category: 'reaction',
  kind: 'arcade',
  solo: true,
  tags: [],
  minPlayers: 1,
  maxPlayers: 4,
  durationMinutes: [0, 1],
  controls: { keyboard: [], touch: [] },
  rules: [],
  mobileFriendly: true,
  accent: '#ffffff',
};

type CounterCfg = { ticks: number };
const counterSim: ArcadeSim<CounterCfg> = {
  hz: 30,
  maxTicks: (cfg) => cfg.ticks,
  replay: (_seed, _cfg, events) => ({ score: events.length, ticks: events.at(-1)?.tick ?? 0 }),
};
const counterPlugin = createArcadePlugin({ meta, defaultConfig: { ticks: 300 }, sim: counterSim });
// 300 ticks at 30 Hz = 10 s, plus the submit grace.
const DEADLINE_MS = 10_000 + ARCADE.SUBMIT_GRACE_MS;

/** n events, two per second at 30 Hz: well inside every limit. */
const events = (n: number): InputEvent[] => Array.from({ length: n }, (_, k) => ({ tick: k * 15, code: k % 4 }));

function submit(h: GameHarness, playerId: string, chunks: ArcadeChunk[], extra: Record<string, string | number> = {}) {
  for (const c of chunks) h.instance.handleAction(playerId, { type: 'arcade:chunk', ...c, ...extra });
}

function started(players = 1, config: Record<string, unknown> = {}, seed = 1) {
  const h = new GameHarness(counterPlugin, players, config, seed);
  h.instance.start();
  return h;
}

const scoreOf = (h: GameHarness, id: string) => h.result?.scores.find((s) => s.playerId === id)?.score;

describe('input log encoding', () => {
  it('encode then decode round-trips', () => {
    const ev: InputEvent[] = [
      { tick: 0, code: 0 },
      { tick: 0, code: 1 }, // two keys on the same tick are allowed (non-decreasing)
      { tick: 7, code: 255 },
      { tick: 200, code: 3 },
      { tick: 299, code: 128 },
    ];
    const s = encodeInputLog(ev);
    expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(decodeInputLog(s, 300, 30)).toEqual(ev);
    expect(decodeInputLog(encodeInputLog([]), 300)).toEqual([]);
  });

  it('decode rejects non-monotonic ticks', () => {
    expect(decodeInputLog(encodeInputLog([{ tick: 10, code: 1 }, { tick: 9, code: 1 }]), 300)).toBeNull();
    expect(decodeInputLog(encodeInputLog([{ tick: -1, code: 1 }]), 300)).toBeNull();
  });

  it('decode rejects ticks beyond maxTicks', () => {
    expect(decodeInputLog(encodeInputLog([{ tick: 300, code: 1 }]), 300)).not.toBeNull();
    expect(decodeInputLog(encodeInputLog([{ tick: 301, code: 1 }]), 300)).toBeNull();
  });

  it('decode rejects more than 15 events per second', () => {
    const ok = Array.from({ length: 15 }, (_, k) => ({ tick: k * 2, code: 1 })); // 15 in ticks 0..28
    expect(decodeInputLog(encodeInputLog(ok), 300, 30)).toHaveLength(15);
    const burst = Array.from({ length: 16 }, (_, k) => ({ tick: k, code: 1 }));
    expect(decodeInputLog(encodeInputLog(burst), 300, 30)).toBeNull();
    // The window is one second of ticks: 16 events spread over exactly 30 ticks (0..30) pass.
    const spread = Array.from({ length: 16 }, (_, k) => ({ tick: k * 2, code: 1 }));
    expect(decodeInputLog(encodeInputLog(spread), 300, 30)).toHaveLength(16);
    // Same log at 60 Hz is 16 events in half a second: rejected.
    expect(decodeInputLog(encodeInputLog(spread), 300, 60)).toBeNull();
  });

  it('decode rejects codes outside 0..255', () => {
    expect(decodeInputLog(encodeInputLog([{ tick: 1, code: 256 }]), 300)).toBeNull();
  });

  it('decode rejects invalid base64url', () => {
    const good = encodeInputLog(events(3));
    for (const bad of ['ab+c', 'ab/c', 'abc=', 'ab c', 'é', 'A', '\u0000AAA', good + '=', good.slice(0, 1)]) {
      expect(decodeInputLog(bad, 300)).toBeNull();
    }
    expect(decodeInputLog(123 as unknown as string, 300)).toBeNull();
  });

  it('decode rejects truncated varints, trailing garbage and oversized logs', () => {
    // 0x80 is a varint continuation byte with nothing after it.
    expect(decodeInputLog('gA', 300)).toBeNull();
    // A tick delta without its code byte.
    expect(decodeInputLog('Ag', 300)).toBeNull();
    // Way past MAX_LOG_BYTES.
    expect(decodeInputLog('A'.repeat(Math.ceil((ARCADE.MAX_LOG_BYTES * 4) / 3) + 8), 1e9)).toBeNull();
  });

  it('splitChunks stays within 1400 chars and reassembles', () => {
    const log = 'abcdefghij'.repeat(1000); // 10 000 chars
    const chunks = splitChunks(log);
    expect(chunks.length).toBe(Math.ceil(10_000 / ARCADE.CHUNK_CHARS));
    expect(chunks.length).toBeLessThanOrEqual(ARCADE.MAX_CHUNKS);
    for (const c of chunks) expect(c.d.length).toBeLessThanOrEqual(ARCADE.CHUNK_CHARS);
    const a = new ChunkAssembler();
    for (const c of [...chunks].reverse()) a.add(c); // order does not matter
    expect(a.complete()).toBe(true);
    expect(a.join()).toBe(log);
    expect(splitChunks('')).toEqual([{ i: 0, n: 1, d: '' }]);
  });

  it('assembler ignores duplicate and out-of-range chunks', () => {
    const a = new ChunkAssembler();
    a.add({ i: 0, n: 2, d: 'AA' });
    a.add({ i: 0, n: 2, d: 'ZZ' }); // duplicate: first one wins
    a.add({ i: 2, n: 2, d: 'XX' }); // i >= n
    a.add({ i: 16, n: 2, d: 'XX' });
    a.add({ i: -1, n: 2, d: 'XX' });
    a.add({ i: 0.5, n: 2, d: 'XX' });
    a.add({ i: 1, n: 2, d: 'x'.repeat(ARCADE.CHUNK_CHARS + 1) }); // too long
    a.add(null as unknown as ArcadeChunk);
    expect(a.complete()).toBe(false);
    expect(a.join()).toBeNull();
    a.add({ i: 1, n: 2, d: 'BB' });
    expect(a.complete()).toBe(true);
    expect(a.join()).toBe('AABB');
  });

  it('assembler rejects mixed n', () => {
    const a = new ChunkAssembler();
    a.add({ i: 0, n: 2, d: 'AA' });
    a.add({ i: 1, n: 3, d: 'BB' });
    a.add({ i: 1, n: 2, d: 'BB' });
    a.add({ i: 2, n: 3, d: 'CC' });
    expect(a.rejected).toBe(true);
    expect(a.complete()).toBe(false);
    expect(a.join()).toBeNull();
  });
});

describe('arcade recorder (client side)', () => {
  it('records inputs and produces chunks the server accepts', () => {
    const r = new ArcadeRecorder(30);
    for (const e of events(5)) expect(r.record(e.tick, e.code)).toBe(true);
    const chunks = r.finish();
    const a = new ChunkAssembler();
    for (const c of chunks) a.add(c);
    expect(decodeInputLog(a.join()!, 300, 30)).toEqual(events(5));
  });

  it('drops inputs the server would reject, so an honest log always verifies', () => {
    const r = new ArcadeRecorder(30);
    expect(r.record(10, 1)).toBe(true);
    expect(r.record(9, 1)).toBe(false); // backwards
    expect(r.record(11, 256)).toBe(false); // bad code
    expect(r.record(-1, 1)).toBe(false);
    let accepted = 1;
    for (let k = 0; k < 40; k++) if (r.record(12 + (k >> 2), 2)) accepted++; // 40 inputs within ticks 12..21
    expect(accepted).toBe(ARCADE.MAX_EVENTS_PER_SEC);
    const a = new ChunkAssembler();
    for (const c of r.finish()) a.add(c);
    expect(decodeInputLog(a.join()!, 300, 30)).toHaveLength(ARCADE.MAX_EVENTS_PER_SEC);
  });
});

describe('arcade plugin', () => {
  it('same seed gives same state seed', () => {
    const a = started(1, {}, 7);
    const b = started(1, {}, 7);
    const sa = a.instance.getState('p1') as { seed: number };
    expect(sa.seed).toBe((b.instance.getState('p1') as { seed: number }).seed);
    expect(Number.isInteger(sa.seed) && sa.seed >= 1 && sa.seed <= 2147483647).toBe(true);
    // An explicit config seed wins; an out-of-range one falls back to the rng.
    expect((started(1, { seed: 42 }).instance.getState(null) as { seed: number }).seed).toBe(42);
    expect((started(1, { seed: 0 }, 7).instance.getState(null) as { seed: number }).seed).toBe(sa.seed);
    expect((started(1, { seed: 1.5 }, 7).instance.getState(null) as { seed: number }).seed).toBe(sa.seed);
  });

  it('broadcasts arcade:start and exposes no scores in state', () => {
    const h = started(2, { seed: 99 });
    const ev = h.events('arcade:start')[0]!;
    expect(ev.to).toBe('*');
    expect(ev.payload).toMatchObject({ seed: 99, config: { ticks: 300, seed: 99 }, deadlineMs: h.clock + DEADLINE_MS });
    submit(h, 'p1', splitChunks(encodeInputLog(events(4))));
    const s = h.instance.getState('p2');
    expect(s).toEqual({ seed: 99, config: { ticks: 300, seed: 99 }, deadline: h.clock + DEADLINE_MS, submitted: ['p1'] });
    expect(JSON.stringify(h.instance.getState(null))).not.toMatch(/score/);
  });

  it('plugin uses the replayed score, not a claimed one', () => {
    const h = started(1);
    submit(h, 'p1', splitChunks(encodeInputLog(events(3))), { score: 999999 });
    expect(h.result).not.toBeNull();
    expect(scoreOf(h, 'p1')).toBe(3);
    expect(h.result!.summary).toEqual({ seed: (h.instance.getState('p1') as { seed: number }).seed });
  });

  it('finishes when all players submit', () => {
    const h = started(2);
    submit(h, 'p1', splitChunks(encodeInputLog(events(2))));
    expect(h.result).toBeNull();
    submit(h, 'p2', splitChunks(encodeInputLog(events(5))));
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 2 },
      { playerId: 'p2', score: 5 },
    ]);
  });

  it('a second submission does not change the score', () => {
    const h = started(2);
    submit(h, 'p1', splitChunks(encodeInputLog(events(2))));
    submit(h, 'p1', splitChunks(encodeInputLog(events(9))));
    submit(h, 'p2', splitChunks(encodeInputLog(events(1))));
    expect(scoreOf(h, 'p1')).toBe(2);
  });

  it('finishes at the deadline with 0 for a player who never submitted', () => {
    const h = started(2);
    submit(h, 'p1', splitChunks(encodeInputLog(events(4))));
    h.advance(DEADLINE_MS - 40);
    expect(h.result).toBeNull();
    h.advance(80);
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 4 },
      { playerId: 'p2', score: 0 },
    ]);
  });

  it('ignores 17 chunks', () => {
    const h = started(2);
    // 17 chunks: the shape-invalid 17th and every chunk after completion are ignored.
    const parts = splitChunks(encodeInputLog(events(3)));
    for (let i = 0; i <= 16; i++) h.instance.handleAction('p1', { type: 'arcade:chunk', i, n: 17, d: 'AAAA' });
    expect(h.result).toBeNull();
    expect((h.instance.getState('p1') as { submitted: string[] }).submitted).toEqual([]);
    // n=16 garbage chunks complete the set, decode fails, the player scores 0; chunk 17 is ignored.
    for (let i = 0; i <= 16; i++) h.instance.handleAction('p2', { type: 'arcade:chunk', i, n: 16, d: 'AAAA' });
    expect((h.instance.getState('p1') as { submitted: string[] }).submitted).toEqual(['p2']);
    // p1 can still submit a real run (the n=17 junk never started an assembly).
    submit(h, 'p1', parts);
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 3 },
      { playerId: 'p2', score: 0 },
    ]);
  });

  it('hostile chunk payloads never throw or end the match early', () => {
    const h = started(2);
    const junk: Record<string, unknown>[] = [
      { type: 'arcade:chunk' },
      { type: 'arcade:chunk', i: '0', n: 1, d: '' },
      { type: 'arcade:chunk', i: 0, n: 1, d: 5 },
      { type: 'arcade:chunk', i: 0, n: 1, d: null },
      { type: 'arcade:chunk', i: 1, n: 1, d: 'AA' },
      { type: 'arcade:chunk', i: NaN, n: 1, d: 'AA' },
      { type: 'arcade:chunk', i: 0, n: Infinity, d: 'AA' },
      { type: 'arcade:chunk', i: 0, n: 1, d: 'x'.repeat(100_000) },
      { type: 'something-else', i: 0, n: 1, d: '' },
    ];
    for (const j of junk) expect(() => h.instance.handleAction('p1', j as never)).not.toThrow();
    expect(() => h.instance.handleAction('p1', null as never)).not.toThrow();
    expect(() => h.instance.handleAction('p1', 'str' as never)).not.toThrow();
    expect(() => h.instance.handleAction('stranger', { type: 'arcade:chunk', i: 0, n: 1, d: '' })).not.toThrow();
    expect(h.result).toBeNull();
    expect((h.instance.getState(null) as { submitted: string[] }).submitted).toEqual([]);
    // Mixed n poisons only that player's own submission (score 0); others are unaffected.
    h.instance.handleAction('p1', { type: 'arcade:chunk', i: 0, n: 2, d: 'AA' });
    h.instance.handleAction('p1', { type: 'arcade:chunk', i: 1, n: 3, d: 'AA' });
    expect((h.instance.getState(null) as { submitted: string[] }).submitted).toEqual(['p1']);
    submit(h, 'p2', splitChunks(encodeInputLog(events(2))));
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 0 },
      { playerId: 'p2', score: 2 },
    ]);
  });

  it('an invalid log scores 0 and does not throw', () => {
    const cases = [
      encodeInputLog([{ tick: 5, code: 1 }, { tick: 4, code: 1 }]), // non-monotonic
      encodeInputLog([{ tick: 301, code: 1 }]), // past the cap
      encodeInputLog(Array.from({ length: 16 }, (_, k) => ({ tick: k, code: 1 }))), // > 15/s
      'not*base64',
    ];
    for (const log of cases) {
      const h = started(1);
      expect(() => submit(h, 'p1', splitChunks(log))).not.toThrow();
      expect(scoreOf(h, 'p1')).toBe(0);
    }
  });

  it('a throwing or non-finite sim scores 0', () => {
    const bad = createArcadePlugin({
      meta,
      defaultConfig: { ticks: 300 },
      sim: { ...counterSim, replay: (_s, _c, ev) => (ev.length > 1 ? { score: NaN, ticks: 0 } : (() => { throw new Error('boom'); })()) },
    });
    const h = new GameHarness(bad, 2);
    h.instance.start();
    expect(() => submit(h, 'p1', splitChunks(encodeInputLog(events(1))))).not.toThrow();
    submit(h, 'p2', splitChunks(encodeInputLog(events(2))));
    expect(h.result!.scores.map((s) => s.score)).toEqual([0, 0]);
  });

  it('ignores chunks before start and after finish', () => {
    const h = new GameHarness(counterPlugin, 1);
    submit(h, 'p1', splitChunks(encodeInputLog(events(3))));
    expect(h.result).toBeNull();
    h.instance.start();
    expect((h.instance.getState('p1') as { submitted: string[] }).submitted).toEqual([]);
    submit(h, 'p1', splitChunks(encodeInputLog(events(1))));
    expect(scoreOf(h, 'p1')).toBe(1);
  });

  it('a disconnected player does not block the deadline', () => {
    const h = started(2);
    h.connected.delete('p2');
    h.instance.onPlayerConnectionChange?.('p2', false);
    expect(h.result).toBeNull(); // p1 is still playing
    h.advance(DEADLINE_MS + 40);
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 0 },
      { playerId: 'p2', score: 0 },
    ]);
  });

  it('a disconnected player does not block an early finish', () => {
    const h = started(2);
    h.connected.delete('p2');
    h.instance.onPlayerConnectionChange?.('p2', false);
    submit(h, 'p1', splitChunks(encodeInputLog(events(3))));
    expect(h.result!.scores).toEqual([
      { playerId: 'p1', score: 3 },
      { playerId: 'p2', score: 0 },
    ]);
  });

  it('a player who disconnects after the others submitted ends the match', () => {
    const h = started(2);
    submit(h, 'p1', splitChunks(encodeInputLog(events(3))));
    expect(h.result).toBeNull();
    h.connected.delete('p2');
    h.instance.onPlayerConnectionChange?.('p2', false);
    expect(scoreOf(h, 'p1')).toBe(3);
  });

  it('dispose clears timers and prevents a late finish', () => {
    const h = started(1);
    h.instance.dispose();
    h.advance(DEADLINE_MS + 100);
    expect(h.result).toBeNull();
  });
});
