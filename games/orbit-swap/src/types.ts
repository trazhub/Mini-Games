/** [angle, lane, dir(1|-1), invulnerable(0|1), score, connected(0|1)] */
export type PackedPlayer = [number, number, number, number, number, number];
/** [id, lane, angle0, omega, width, t0, expiresAt] */
export type PackedHazard = [number, number, number, number, number, number, number];
/** [id, lane, angle, value, expiresAt] */
export type PackedStar = [number, number, number, number, number];

/** High-frequency movement snapshot (players in `order`). */
export interface OrbitSnapshot {
  t: number;
  p: PackedPlayer[];
}

/** Full resync state, sent on join/reconnect and phase changes. */
export interface OrbitFullState {
  phase: 'countdown' | 'playing' | 'done';
  order: string[];
  countdownMs: number;
  matchMs: number;
  t: number;
  hazards: PackedHazard[];
  stars: PackedStar[];
  players: PackedPlayer[];
}

export type OrbitAction = { type: 'swap'; d: 1 | -1 } | { type: 'flip' };
