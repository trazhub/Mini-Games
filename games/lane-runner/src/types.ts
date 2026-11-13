/**
 * Game config. Small and JSON-serializable: it is broadcast to clients in `arcade:start`.
 * `seed` follows the arcade plugin convention (an integer in 1..2147483647 pins the run's seed,
 * otherwise the server draws one).
 */
export type LaneConfig = { seed?: number };

/** One spawn row, crossed when the runner's distance reaches `d`. */
export interface Row {
  /** Distance at which the row is crossed. */
  d: number;
  /** Bit `l` set = an obstacle blocks lane `l`. Never all three lanes. */
  mask: number;
  /** Lane holding a coin (always a free lane), or -1. */
  coin: number;
}

/** Produces the endless, seeded sequence of rows. Internal to a run. */
export interface RowSource {
  next(): Row;
}

/** Live state of one run. Renderers may read every field but must only change it via `stepRun`. */
export interface RunState {
  /** Ticks simulated so far (the next `stepRun` simulates tick number `tick`). */
  tick: number;
  /** Distance travelled, in world units. */
  distance: number;
  /** Current lane, 0 (left) .. 2 (right). */
  lane: number;
  /** Coins collected. */
  coins: number;
  /** False once the runner has hit an obstacle. */
  alive: boolean;
  /** True once the run is over (collision or `MAX_TICKS` reached); further steps are no-ops. */
  done: boolean;
  /** Upcoming rows ahead of the runner, nearest first (never empty). */
  rows: Row[];
  /** Row generator (internal). */
  source: RowSource;
}
