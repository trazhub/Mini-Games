import type { Rng } from '@minigamehub/game-core';
import { LANES, ORBIT, angDist, omegaForLane, wrapAngle } from './constants';

export interface SimPlayer {
  id: string;
  angle: number;
  lane: number;
  targetLane: number;
  dir: 1 | -1;
  score: number;
  stars: number;
  hits: number;
  invulnUntil: number;
  nextSwapAt: number;
  nextFlipAt: number;
  connected: boolean;
}

export interface Hazard {
  id: number;
  lane: number;
  angle0: number;
  omega: number;
  width: number;
  /** Sim time (ms) at which the hazard was at angle0. */
  t0: number;
  expiresAt: number;
}

export interface Star {
  id: number;
  lane: number;
  angle: number;
  value: number;
  expiresAt: number;
}

export type SimEvent =
  | { type: 'hazard'; hazard: Hazard }
  | { type: 'star'; star: Star }
  | { type: 'starx'; id: number; by: string }
  | { type: 'hit'; playerId: string; score: number }
  | { type: 'collect'; playerId: string; value: number; score: number };

export function hazardAngle(h: Hazard, t: number): number {
  return wrapAngle(h.angle0 + h.omega * ((t - h.t0) / 1000));
}

/**
 * Authoritative Orbit Swap simulation. Pure and deterministic given its Rng: no I/O, no
 * wall-clock, no Phaser. The server owns the only instance that matters; clients merely render
 * what snapshots/events tell them.
 */
export class OrbitSim {
  /** Sim time in ms since match start (after the countdown). */
  t = 0;
  players: SimPlayer[];
  hazards: Hazard[] = [];
  stars: Star[] = [];
  private nextId = 1;
  private nextHazardAt = 1500;
  private nextStarAt = 300;
  private events: SimEvent[] = [];
  private matchMs: number;

  constructor(
    playerIds: readonly string[],
    private rng: Rng,
    overrides: { matchMs?: number } = {},
  ) {
    this.matchMs = overrides.matchMs ?? ORBIT.matchMs;
    const n = playerIds.length;
    this.players = playerIds.map((id, i) => ({
      id,
      angle: (i / n) * Math.PI * 2,
      lane: 1,
      targetLane: 1,
      dir: 1,
      score: 0,
      stars: 0,
      hits: 0,
      invulnUntil: ORBIT.spawnInvulnMs,
      nextSwapAt: 0,
      nextFlipAt: 0,
      connected: true,
    }));
  }

  get done(): boolean {
    return this.t >= this.matchMs;
  }

  get remainingMs(): number {
    return Math.max(0, this.matchMs - this.t);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  playerById(id: string): SimPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Lane change request. Returns false when ignored (cooldown / edge / unknown). */
  swap(playerId: string, d: number): boolean {
    const p = this.playerById(playerId);
    if (!p || !p.connected || this.done) return false;
    if (d !== 1 && d !== -1) return false;
    if (this.t < p.nextSwapAt) return false;
    const next = Math.max(0, Math.min(LANES - 1, p.targetLane + d));
    if (next === p.targetLane) return false;
    p.targetLane = next;
    p.nextSwapAt = this.t + ORBIT.swapCooldownMs;
    return true;
  }

  flip(playerId: string): boolean {
    const p = this.playerById(playerId);
    if (!p || !p.connected || this.done) return false;
    if (this.t < p.nextFlipAt) return false;
    p.dir = p.dir === 1 ? -1 : 1;
    p.nextFlipAt = this.t + ORBIT.flipCooldownMs;
    return true;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.playerById(playerId);
    if (!p) return;
    p.connected = connected;
    if (connected) p.invulnUntil = Math.max(p.invulnUntil, this.t + ORBIT.invulnMs);
  }

  step(dtMs: number): void {
    if (this.done) return;
    const dt = Math.min(dtMs, 100); // clamp pathological stalls
    this.t = Math.min(this.matchMs, this.t + dt);
    const sec = dt / 1000;

    for (const p of this.players) {
      if (!p.connected) continue;
      // Lane easing towards target.
      const diff = p.targetLane - p.lane;
      const stepLane = ORBIT.laneSpeed * sec;
      p.lane = Math.abs(diff) <= stepLane ? p.targetLane : p.lane + Math.sign(diff) * stepLane;
      p.angle = wrapAngle(p.angle + p.dir * omegaForLane(p.lane) * sec);
    }

    this.expire();
    this.spawn();
    this.collide();
  }

  private expire(): void {
    this.hazards = this.hazards.filter((h) => h.expiresAt > this.t);
    this.stars = this.stars.filter((s) => s.expiresAt > this.t);
  }

  private difficulty(): number {
    return Math.min(1, this.t / this.matchMs);
  }

  private spawn(): void {
    if (this.t >= this.nextHazardAt && this.hazards.length < ORBIT.maxHazards) {
      this.spawnHazard();
      const interval = 1300 - 700 * this.difficulty();
      this.nextHazardAt = this.t + interval * (0.8 + this.rng.next() * 0.4);
    }
    if (this.t >= this.nextStarAt && this.stars.length < ORBIT.maxStars) {
      this.spawnStar();
      this.nextStarAt = this.t + 600 + this.rng.next() * 500;
    }
  }

  private spawnHazard(): void {
    const alive = this.players.filter((p) => p.connected);
    let lane = 0;
    let angle = 0;
    // Do not spawn right on top of a player (>= 1.1rad away from anyone on that lane).
    for (let tries = 0; tries < 8; tries++) {
      lane = this.rng.int(0, LANES - 1);
      angle = this.rng.next() * Math.PI * 2;
      const unfair = alive.some((p) => Math.abs(p.lane - lane) < 1.2 && angDist(p.angle, angle) < 1.1);
      if (!unfair) break;
    }
    const speed = 0.5 + this.rng.next() * (0.7 + this.difficulty() * 0.8);
    const h: Hazard = {
      id: this.nextId++,
      lane,
      angle0: angle,
      omega: (this.rng.next() < 0.5 ? -1 : 1) * speed,
      width: 0.45 + this.rng.next() * 0.5,
      t0: this.t,
      expiresAt: this.t + ORBIT.hazardLifeMs,
    };
    this.hazards.push(h);
    this.events.push({ type: 'hazard', hazard: h });
  }

  private spawnStar(): void {
    const gold = this.rng.next() < 0.15;
    const s: Star = {
      id: this.nextId++,
      lane: this.rng.int(0, LANES - 1),
      angle: this.rng.next() * Math.PI * 2,
      value: gold ? ORBIT.goldStarPoints : ORBIT.starPoints,
      expiresAt: this.t + ORBIT.starLifeMs,
    };
    this.stars.push(s);
    this.events.push({ type: 'star', star: s });
  }

  private collide(): void {
    for (const p of this.players) {
      if (!p.connected) continue;
      // Stars first so a simultaneous hit does not eat a pickup.
      for (const s of [...this.stars]) {
        if (Math.abs(p.lane - s.lane) < 0.5 && angDist(p.angle, s.angle) < ORBIT.starPickupAngle) {
          this.stars = this.stars.filter((x) => x.id !== s.id);
          p.score += s.value;
          p.stars++;
          this.events.push({ type: 'starx', id: s.id, by: p.id });
          this.events.push({ type: 'collect', playerId: p.id, value: s.value, score: p.score });
        }
      }
      if (this.t < p.invulnUntil) continue;
      for (const h of this.hazards) {
        if (Math.abs(p.lane - h.lane) < 0.6 && angDist(p.angle, hazardAngle(h, this.t)) < h.width / 2 + ORBIT.playerRadius) {
          p.score = Math.max(0, p.score - ORBIT.hitPenalty);
          p.hits++;
          p.invulnUntil = this.t + ORBIT.invulnMs;
          this.events.push({ type: 'hit', playerId: p.id, score: p.score });
          break;
        }
      }
    }
  }
}
