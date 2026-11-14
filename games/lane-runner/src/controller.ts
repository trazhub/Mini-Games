/**
 * Browser-side run controller for Lane Runner. Pure (no DOM, no clock): the React client drives it
 * from a fixed-step loop and from input events, and tests drive it directly.
 *
 * It owns the local run and the input recorder and keeps them in lockstep: an input is applied to
 * the local run only when the recorder accepted it, and it is recorded at the tick it is applied
 * (`run.tick`), which is exactly what the server's replay does. So the local score equals the
 * server's score for the same log.
 */
import { ArcadeRecorder } from '@minigamehub/game-core';
import type { ArcadeChunk } from '@minigamehub/shared';
import { LANE_LEFT, LANE_RIGHT, TICK_HZ, advanceRun, applyInput, createRun, defaultLaneConfig, runScore } from './sim';
import type { LaneConfig, RunState } from './types';

export type Direction = 'left' | 'right';

export const DIRECTION_CODE: Record<Direction, number> = { left: LANE_LEFT, right: LANE_RIGHT };

/** ArrowLeft/A and ArrowRight/D (case-insensitive); anything else is not a game key. */
export function keyToDirection(key: string): Direction | null {
  switch (key.toLowerCase()) {
    case 'arrowleft':
    case 'a':
      return 'left';
    case 'arrowright':
    case 'd':
      return 'right';
    default:
      return null;
  }
}

export interface RunController {
  readonly run: RunState;
  readonly done: boolean;
  /** Apply a lane change. Returns false when it was ignored (run over, or the recorder refused it). */
  input(dir: Direction): boolean;
  /** Simulate one tick. */
  advance(): void;
  /** Live score (distance + coins). */
  score(): number;
  /** The recorded inputs as protocol chunks. Call once the run is over (or is being cut short). */
  finish(): ArcadeChunk[];
}

export function createRunController(seed: number, cfg: LaneConfig = defaultLaneConfig): RunController {
  const run = createRun(seed, cfg);
  const recorder = new ArcadeRecorder(TICK_HZ);
  return {
    run,
    get done() {
      return run.done;
    },
    input(dir) {
      if (run.done) return false;
      const code = DIRECTION_CODE[dir];
      if (!recorder.record(run.tick, code)) return false;
      applyInput(run, code);
      return true;
    },
    advance() {
      advanceRun(run);
    },
    score: () => runScore(run),
    finish: () => recorder.finish(),
  };
}
