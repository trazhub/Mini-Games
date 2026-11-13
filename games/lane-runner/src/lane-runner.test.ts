import { ArcadeRecorder, GameHarness, decodeInputLog, encodeInputLog, splitChunks, type InputEvent } from '@minigamehub/game-core';
import { describe, expect, it } from 'vitest';
import { laneRunnerMeta } from './meta';
import { laneRunnerPlugin } from './server';
import {
  COIN_VALUE,
  LANE_LEFT,
  LANE_RIGHT,
  LANES,
  MAX_TICKS,
  TICK_HZ,
  createRun,
  defaultLaneConfig,
  laneRunnerSim,
  rowsFor,
  runScore,
  stepRun,
} from './sim';
import type { RunState } from './types';

const CFG = defaultLaneConfig;

/** Free lane nearest to `lane`. */
function nearestFree(mask: number, lane: number): number {
  for (let d = 0; d < LANES; d++) {
    for (const l of [lane - d, lane + d]) if (l >= 0 && l < LANES && (mask & (1 << l)) === 0) return l;
  }
  return lane;
}

/** A perfect player that reads the generated rows: heads for the next coin, else the nearest free lane. */
function perfectCode(s: RunState, seekCoins = true): number | null {
  const row = s.rows[0];
  if (!row) return null;
  const target = seekCoins && row.coin >= 0 ? row.coin : nearestFree(row.mask, s.lane);
  return s.lane > target ? LANE_LEFT : s.lane < target ? LANE_RIGHT : null;
}

function playPerfect(seed: number, seekCoins = true) {
  const s = createRun(seed, CFG);
  const events: InputEvent[] = [];
  const rec = new ArcadeRecorder(TICK_HZ);
  while (!s.done) {
    const code = perfectCode(s, seekCoins);
    if (code !== null) {
      expect(rec.record(s.tick, code)).toBe(true); // a real client could record every one of these
      events.push({ tick: s.tick, code });
    }
    stepRun(s, code);
  }
  return { state: s, events, chunks: rec.finish() };
}

function runIdle(seed: number): RunState {
  const s = createRun(seed, CFG);
  while (!s.done) stepRun(s, null);
  return s;
}

describe('lane runner sim', () => {
  it('same seed and inputs give the same score', () => {
    const events: InputEvent[] = [
      { tick: 10, code: LANE_LEFT },
      { tick: 40, code: LANE_RIGHT },
      { tick: 40, code: LANE_RIGHT },
      { tick: 200, code: LANE_LEFT },
    ];
    const a = laneRunnerSim.replay(1234, CFG, events);
    const b = laneRunnerSim.replay(1234, CFG, events);
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThan(0);
  });

  it('different seeds give different obstacle layouts', () => {
    const a = rowsFor(1, 40);
    const b = rowsFor(2, 40);
    expect(a).toHaveLength(40);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(rowsFor(1, 40))).toBe(JSON.stringify(a));
  });

  it('no input eventually ends the run by collision', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const s = runIdle(seed);
      expect(s.alive).toBe(false);
      expect(s.tick).toBeLessThan(MAX_TICKS);
      const { score, ticks } = laneRunnerSim.replay(seed, CFG, []);
      expect(score).toBe(runScore(s));
      expect(ticks).toBe(s.tick);
    }
  });

  it('moving left/right changes lane and stays within 0..2', () => {
    const s = createRun(7, CFG);
    expect(s.lane).toBe(1);
    stepRun(s, LANE_LEFT);
    expect(s.lane).toBe(0);
    stepRun(s, LANE_LEFT);
    expect(s.lane).toBe(0);
    stepRun(s, LANE_RIGHT);
    expect(s.lane).toBe(1);
    stepRun(s, LANE_RIGHT);
    expect(s.lane).toBe(2);
    stepRun(s, LANE_RIGHT);
    expect(s.lane).toBe(2);
    stepRun(s, 0); // unknown codes are ignored
    stepRun(s, 3);
    stepRun(s, 255);
    expect(s.lane).toBe(2);
  });

  it('collecting a coin adds 25', () => {
    const s = createRun(11, CFG);
    let collected = false;
    while (!s.done && !collected) {
      const before = { coins: s.coins, score: runScore(s) };
      stepRun(s, perfectCode(s));
      if (s.coins > before.coins) {
        collected = true;
        expect(s.coins).toBe(before.coins + 1);
        expect(runScore(s) - before.score).toBeGreaterThanOrEqual(COIN_VALUE);
        expect(COIN_VALUE).toBe(25);
        expect(runScore(s)).toBe(Math.floor(s.distance) + 25 * s.coins);
      }
    }
    expect(collected).toBe(true);
  });

  it('a free lane exists in every row (fairness)', () => {
    for (const seed of [1, 2, 3, 17, 1000, 2147483647]) {
      const rows = rowsFor(seed, 600);
      rows.forEach((row, i) => {
        expect(row.mask & 0b111).toBe(row.mask);
        expect(row.mask).not.toBe(0b111);
        if (row.coin >= 0) expect(row.mask & (1 << row.coin)).toBe(0); // coins only in free lanes
        if (i === 0) return;
        // a path exists that never needs more than one lane change between consecutive rows
        const prev = rows[i - 1]!;
        let ok = false;
        for (let a = 0; a < LANES; a++) {
          for (let b = Math.max(0, a - 1); b <= Math.min(LANES - 1, a + 1); b++) {
            if ((prev.mask & (1 << a)) === 0 && (row.mask & (1 << b)) === 0) ok = true;
          }
        }
        expect(ok).toBe(true);
      });
    }
  });

  it('a greedy lane chooser reading the rows never dies for the whole run', () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
      for (const seek of [true, false]) {
        const { state } = playPerfect(seed, seek);
        expect(state.alive).toBe(true);
        expect(state.tick).toBe(MAX_TICKS);
      }
    }
  });

  it('a perfect dodge log from a recorded run replays to the same score', () => {
    const seed = 321;
    const { state, events, chunks } = playPerfect(seed);
    const log = chunks.map((c) => c.d).join('');
    const decoded = decodeInputLog(log, laneRunnerSim.maxTicks(CFG), laneRunnerSim.hz);
    expect(decoded).toEqual(events);
    const replayed = laneRunnerSim.replay(seed, CFG, decoded!);
    expect(replayed.score).toBe(runScore(state));
    expect(replayed.ticks).toBe(MAX_TICKS);
    expect(state.coins).toBeGreaterThan(0);
  });

  it('replay ignores events after death', () => {
    const seed = 5;
    const dead = runIdle(seed);
    const base = laneRunnerSim.replay(seed, CFG, []);
    expect(base.ticks).toBe(dead.tick);
    const late: InputEvent[] = [
      { tick: dead.tick, code: LANE_LEFT },
      { tick: dead.tick + 1, code: LANE_RIGHT },
      { tick: dead.tick + 50, code: LANE_LEFT },
      { tick: MAX_TICKS, code: LANE_RIGHT },
    ];
    expect(laneRunnerSim.replay(seed, CFG, late)).toEqual(base);
  });

  it('is robust to unsorted, negative and non-finite event lists', () => {
    const weird: InputEvent[] = [
      { tick: 500, code: LANE_LEFT },
      { tick: -5, code: LANE_RIGHT },
      { tick: Number.NaN, code: LANE_LEFT },
      { tick: 10 ** 12, code: LANE_RIGHT },
    ];
    const r = laneRunnerSim.replay(9, CFG, weird);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.ticks).toBeLessThanOrEqual(MAX_TICKS);
  });

  it('the sim exposes the arcade contract values', () => {
    expect(laneRunnerSim.hz).toBe(30);
    expect(laneRunnerSim.maxTicks(CFG)).toBe(2700);
  });
});

describe('lane runner plugin', () => {
  it('declares itself as a solo arcade game', () => {
    expect(laneRunnerMeta).toMatchObject({ id: 'lane-runner', kind: 'arcade', solo: true, minPlayers: 1, maxPlayers: 8, category: 'arcade' });
    expect(laneRunnerPlugin.meta).toBe(laneRunnerMeta);
  });

  it('plugin runs headless via GameHarness for 1 player and finishes', () => {
    const h = new GameHarness(laneRunnerPlugin, 1, {}, 77);
    h.instance.start();
    const start = h.events('arcade:start')[0]!;
    const seed = start.payload!.seed as number;
    const { state, chunks } = playPerfect(seed);
    for (const c of chunks) h.instance.handleAction('p1', { type: 'arcade:chunk', ...c });
    expect(h.result).not.toBeNull();
    expect(h.result!.scores).toEqual([{ playerId: 'p1', score: runScore(state) }]);
    expect(h.result!.scores[0]!.score).toBeGreaterThan(1000);
  });

  it('an input log with ticks past 2700 is rejected by the plugin', () => {
    const log = encodeInputLog([
      { tick: 5, code: LANE_LEFT },
      { tick: MAX_TICKS + 1, code: LANE_RIGHT },
    ]);
    expect(decodeInputLog(log, MAX_TICKS, TICK_HZ)).toBeNull();
    const h = new GameHarness(laneRunnerPlugin, 1, {}, 3);
    h.instance.start();
    for (const c of splitChunks(log)) h.instance.handleAction('p1', { type: 'arcade:chunk', ...c });
    expect(h.result!.scores).toEqual([{ playerId: 'p1', score: 0 }]);
  });
});
