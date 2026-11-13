import type { GameContext, GameInstance, GamePlugin, RawAction } from '@minigamehub/game-core';
import { ORBIT } from './constants';
import { orbitSwapMeta } from './meta';
import { OrbitSim, type Hazard, type Star } from './sim';
import type { OrbitFullState, OrbitSnapshot } from './types';

export const defaultConfig = {
  matchMs: ORBIT.matchMs,
  countdownMs: ORBIT.countdownMs,
  snapshotMs: ORBIT.snapshotMs,
};
type Config = typeof defaultConfig;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

class OrbitSwap implements GameInstance {
  private cfg: Config;
  private sim: OrbitSim;
  private phase: 'countdown' | 'playing' | 'done' = 'countdown';
  private countdownLeft: number;
  private sinceSnap = 0;
  private finished = false;

  constructor(private ctx: GameContext) {
    this.cfg = { ...defaultConfig, ...(ctx.config as Partial<Config>) };
    this.sim = new OrbitSim(
      ctx.players.map((p) => p.id),
      ctx.rng,
      { matchMs: this.cfg.matchMs },
    );
    this.countdownLeft = this.cfg.countdownMs;
  }

  start(): void {
    this.ctx.markDirty();
  }

  update(dtMs: number): void {
    if (this.finished) return;
    if (this.phase === 'countdown') {
      this.countdownLeft -= dtMs;
      if (this.countdownLeft <= 0) {
        this.phase = 'playing';
        this.ctx.markDirty(); // clients learn the phase flipped via a full state push
      }
      this.sinceSnap += dtMs;
      if (this.sinceSnap >= this.cfg.snapshotMs * 3) {
        this.sinceSnap = 0;
        this.sendSnapshot(); // keep players visible during countdown
      }
      return;
    }
    this.sim.step(dtMs);
    for (const ev of this.sim.drainEvents()) {
      switch (ev.type) {
        case 'hazard':
          this.ctx.broadcast('hazard', { h: packHazard(ev.hazard) });
          break;
        case 'star':
          this.ctx.broadcast('star', { s: packStar(ev.star) });
          break;
        case 'starx':
          this.ctx.broadcast('starx', { id: ev.id, by: ev.by });
          break;
        case 'hit':
          this.ctx.broadcast('hit', { id: ev.playerId, score: ev.score });
          break;
        case 'collect':
          this.ctx.broadcast('collect', { id: ev.playerId, v: ev.value, score: ev.score });
          break;
      }
    }
    this.sinceSnap += dtMs;
    if (this.sinceSnap >= this.cfg.snapshotMs) {
      this.sinceSnap = 0;
      this.sendSnapshot();
    }
    if (this.sim.done) this.finish();
  }

  private sendSnapshot(): void {
    const snap: OrbitSnapshot = {
      t: Math.round(this.sim.t),
      // [angle, lane, dir, invuln(0/1), score, connected(0/1)] in participant order
      p: this.sim.players.map((p) => [
        r3(p.angle),
        r3(p.lane),
        p.dir,
        this.sim.t < p.invulnUntil ? 1 : 0,
        p.score,
        p.connected ? 1 : 0,
      ]),
    };
    this.ctx.broadcast('snap', snap as unknown as Record<string, unknown>);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    this.ctx.markDirty();
    this.ctx.finish({
      scores: this.sim.players.map((p) => ({ playerId: p.id, score: p.score, tiebreak: p.stars - p.hits })),
      summary: {
        stars: Object.fromEntries(this.sim.players.map((p) => [p.id, p.stars])),
        hits: Object.fromEntries(this.sim.players.map((p) => [p.id, p.hits])),
      },
    });
  }

  handleAction(playerId: string, action: RawAction): void {
    if (this.finished || this.phase !== 'playing') return;
    if (action.type === 'swap') {
      const d = action.d;
      if (d !== 1 && d !== -1) return;
      this.sim.swap(playerId, d);
    } else if (action.type === 'flip') {
      this.sim.flip(playerId);
    }
    // Unknown action types are ignored: the client never reports positions or scores.
  }

  getState(): OrbitFullState {
    return {
      phase: this.phase,
      order: this.sim.players.map((p) => p.id),
      countdownMs: Math.max(0, Math.round(this.countdownLeft)),
      matchMs: this.cfg.matchMs,
      t: Math.round(this.sim.t),
      hazards: this.sim.hazards.map(packHazard),
      stars: this.sim.stars.map(packStar),
      players: this.sim.players.map((p) => [
        r3(p.angle),
        r3(p.lane),
        p.dir,
        this.sim.t < p.invulnUntil ? 1 : 0,
        p.score,
        p.connected ? 1 : 0,
      ]),
    };
  }

  onPlayerConnectionChange(playerId: string, connected: boolean): void {
    this.sim.setConnected(playerId, connected);
    this.ctx.markDirty();
  }

  dispose(): void {
    this.finished = true;
  }
}

function packHazard(h: Hazard): OrbitFullState['hazards'][number] {
  return [h.id, h.lane, r3(h.angle0), r3(h.omega), r3(h.width), h.t0, h.expiresAt];
}
function packStar(s: Star): OrbitFullState['stars'][number] {
  return [s.id, s.lane, r3(s.angle), s.value, s.expiresAt];
}

export const orbitSwapPlugin: GamePlugin = {
  meta: orbitSwapMeta,
  defaultConfig,
  // Full-state pushes only happen on phase changes/(dis)connects; motion uses `snap` events.
  stateIntervalMs: 250,
  createInstance: (ctx) => new OrbitSwap(ctx),
};
