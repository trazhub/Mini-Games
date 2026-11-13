/** Shared between the authoritative server simulation and the Phaser renderer. */
export const LANES = 3;
export const TAU = Math.PI * 2;

export const ORBIT = {
  matchMs: 75_000,
  countdownMs: 3_000,
  /** Angular speed (rad/s) on the innermost lane; outer lanes are slower. */
  omegaInner: 2.4,
  omegaStep: 0.55,
  /** Lane change speed in lanes per second. */
  laneSpeed: 7,
  swapCooldownMs: 130,
  flipCooldownMs: 220,
  playerRadius: 0.13,
  starPickupAngle: 0.3,
  starPoints: 10,
  goldStarPoints: 30,
  hitPenalty: 10,
  invulnMs: 1800,
  spawnInvulnMs: 2500,
  maxStars: 6,
  starLifeMs: 12_000,
  maxHazards: 10,
  hazardLifeMs: 10_000,
  snapshotMs: 66,
} as const;

export const LANE_RADIUS_PX = [120, 190, 260] as const;

export function omegaForLane(lane: number): number {
  return ORBIT.omegaInner - lane * ORBIT.omegaStep;
}

export function wrapAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Smallest absolute angular difference in [0, PI]. */
export function angDist(a: number, b: number): number {
  const d = Math.abs(wrapAngle(a) - wrapAngle(b));
  return d > Math.PI ? TAU - d : d;
}
