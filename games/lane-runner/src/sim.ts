/**
 * Lane Runner simulation: pure, deterministic, shared by the browser client and the server.
 *
 * No DOM, no clock, no `Math.random`: the only randomness is the seeded rng, consumed in a fixed
 * order that does not depend on the player's inputs. Cost is O(ticks + events), no per-tick
 * allocation beyond one small row object every `ROW_SPACING` units.
 *
 * Step API (what a renderer drives, and what `laneRunnerSim.replay` is built from):
 *   const run = createRun(seed, cfg);          // tick 0, lane 1, rows prefilled
 *   while (!run.done) {
 *     stepRun(run, code);                      // code: LANE_LEFT | LANE_RIGHT | null (other codes ignored)
 *     draw(run.lane, run.distance, run.rows);  // `rows` = upcoming rows, nearest first
 *   }
 *   runScore(run);                             // floor(distance) + 25 * coins
 * For several inputs on the same tick call `applyInput` for each, then `advanceRun` once
 * (`stepRun(s, code)` is exactly `applyInput(s, code)` + `advanceRun(s)`).
 *
 * Timing contract (the recorder and the replay agree on it): an input recorded at tick `t` is applied
 * BEFORE simulating tick `t`, i.e. when `run.tick === t`. Lane changes are instant; the lane the
 * runner is in when a row's distance is reached decides collision and coin pickup for that row.
 * The run ends on the first collision or when `MAX_TICKS` have been simulated.
 *
 * Fairness: every row is generated around a "safe lane" that random-walks by at most one lane per
 * row; obstacles only ever fill other lanes, so a free lane always exists, a free lane is always
 * within one lane of a free lane in the previous row, and coins only appear in free lanes. Rows are
 * at least `ROW_SPACING / (MAX_SPEED / TICK_HZ)` (> 8) ticks apart, so a perfect player has time.
 */
import { createRng, type ArcadeSim, type InputEvent } from '@minigamehub/game-core';
import type { LaneConfig, Row, RowSource, RunState } from './types';

export const TICK_HZ = 30;
export const MAX_TICKS = 2700; // 90 s
export const LANES = 3;
export const START_LANE = 1;
/** Input codes (the rest are ignored). */
export const LANE_LEFT = 1;
export const LANE_RIGHT = 2;
export const COIN_VALUE = 25;

/** Distance between spawn rows, and where the first row sits (world units). */
export const ROW_SPACING = 6;
export const FIRST_ROW = 40;
/** How far ahead of the runner rows are generated. */
export const LOOKAHEAD = 120;
/** Speed in units/second: ramps linearly with distance up to a cap. */
export const BASE_SPEED = 9;
export const MAX_SPEED = 22;
export const SPEED_PER_UNIT = 0.012;
/** Chance that a non-safe lane is blocked / that a row carries a coin. */
const BLOCK_P = 0.55;
const COIN_P = 0.4;

export const defaultLaneConfig: LaneConfig = {};

export const speedAt = (distance: number): number => Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_UNIT * distance);

/** Endless seeded row generator. Always consumes the same number of rng draws per row. */
function createRowSource(seed: number): RowSource {
  const rng = createRng(seed);
  let index = 0;
  let safe = START_LANE;
  return {
    next(): Row {
      safe = Math.min(LANES - 1, Math.max(0, safe + rng.int(-1, 1)));
      let mask = 0;
      for (let lane = 0; lane < LANES; lane++) {
        const roll = rng.next();
        if (lane !== safe && roll < BLOCK_P) mask |= 1 << lane;
      }
      const coinRoll = rng.next();
      const coinPick = rng.next();
      let coin = -1;
      if (coinRoll < COIN_P) {
        let free = 0;
        for (let lane = 0; lane < LANES; lane++) if ((mask & (1 << lane)) === 0) free++;
        let nth = Math.floor(coinPick * free);
        for (let lane = 0; lane < LANES; lane++) {
          if ((mask & (1 << lane)) !== 0) continue;
          if (nth-- === 0) {
            coin = lane;
            break;
          }
        }
      }
      return { d: FIRST_ROW + index++ * ROW_SPACING, mask, coin };
    },
  };
}

/** The first `count` rows of a seed's course (for tests and tooling). */
export function rowsFor(seed: number, count: number): Row[] {
  const source = createRowSource(seed);
  return Array.from({ length: count }, () => source.next());
}

function fillRows(s: RunState): void {
  let last = s.rows.at(-1)?.d ?? -Infinity;
  while (s.rows.length === 0 || last < s.distance + LOOKAHEAD) {
    const row = s.source.next();
    s.rows.push(row);
    last = row.d;
  }
}

export function createRun(seed: number, _cfg: LaneConfig = defaultLaneConfig): RunState {
  const s: RunState = {
    tick: 0,
    distance: 0,
    lane: START_LANE,
    coins: 0,
    alive: true,
    done: false,
    rows: [],
    source: createRowSource(seed),
  };
  fillRows(s);
  return s;
}

/** Apply one input code to the runner. Unknown codes and inputs after the run ended do nothing. */
export function applyInput(s: RunState, code: number | null): void {
  if (s.done) return;
  if (code === LANE_LEFT) s.lane = Math.max(0, s.lane - 1);
  else if (code === LANE_RIGHT) s.lane = Math.min(LANES - 1, s.lane + 1);
}

/** Simulate one tick: move forward, then resolve every row that was reached. */
export function advanceRun(s: RunState): void {
  if (s.done) return;
  s.distance += speedAt(s.distance) / TICK_HZ;
  s.tick++;
  fillRows(s);
  while (s.rows.length > 0 && s.rows[0]!.d <= s.distance) {
    const row = s.rows.shift()!;
    if ((row.mask & (1 << s.lane)) !== 0) {
      s.alive = false;
      s.done = true;
      return;
    }
    if (row.coin === s.lane) s.coins++;
  }
  fillRows(s);
  if (s.tick >= MAX_TICKS) s.done = true;
}

/** Apply `code` (or nothing) and simulate one tick. */
export function stepRun(s: RunState, code: number | null): void {
  if (s.done) return;
  applyInput(s, code);
  advanceRun(s);
}

export const runScore = (s: Pick<RunState, 'distance' | 'coins'>): number => Math.floor(s.distance) + COIN_VALUE * s.coins;

export const laneRunnerSim: ArcadeSim<LaneConfig> = {
  hz: TICK_HZ,
  maxTicks: () => MAX_TICKS,
  replay(seed: number, cfg: LaneConfig, events: InputEvent[]) {
    const s = createRun(seed, cfg);
    let i = 0;
    while (!s.done) {
      // Robust to any list: an event is due once its tick is not in the future (this also swallows
      // negative and non-finite ticks), and events that come due after the run ended are never read.
      while (i < events.length && !(events[i]!.tick > s.tick)) applyInput(s, events[i++]!.code);
      advanceRun(s);
    }
    return { score: runScore(s), ticks: s.tick };
  },
};
