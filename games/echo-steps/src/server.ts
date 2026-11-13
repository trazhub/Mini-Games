import type { GameContext, GameInstance, GamePlugin, RawAction } from '@minigamehub/game-core';
import { echoStepsMeta } from './meta';
import type { EchoPhase, EchoPlayerState, EchoRoundResult, EchoState } from './types';

export const defaultConfig = {
  pads: 4,
  startLength: 3,
  maxRounds: 12,
  introMs: 2500,
  /** Lead-in before the first step lights up. */
  watchLeadMs: 700,
  stepMs: 650,
  inputBaseMs: 2500,
  inputPerStepMs: 1000,
  /** The server keeps accepting input this long after the displayed deadline (latency fairness). */
  latencyGraceMs: 1000,
  resultMs: 2600,
  basePoints: 100,
  perExtraStepPoints: 10,
  maxSpeedBonus: 30,
  survivorBonus: 50,
};

type Config = typeof defaultConfig;

interface Live {
  status: 'active' | 'out';
  progress: number;
  done: boolean;
  failed: boolean;
}

class EchoSteps implements GameInstance {
  private cfg: Config;
  private phase: EchoPhase = 'intro';
  private round = 0;
  private sequence: number[] = [];
  private showStartsAt = 0;
  private endsAt = 0;
  private inputStartsAt = 0;
  private closesAt = 0;
  private live = new Map<string, Live>();
  private scores = new Map<string, number>();
  private roundsSurvived = new Map<string, number>();
  private roundResults: EchoRoundResult[] | null = null;
  private finished = false;

  constructor(private ctx: GameContext) {
    this.cfg = { ...defaultConfig, ...(ctx.config as Partial<Config>) };
    for (const p of ctx.players) {
      this.live.set(p.id, { status: 'active', progress: 0, done: false, failed: false });
      this.scores.set(p.id, 0);
      this.roundsSurvived.set(p.id, 0);
    }
  }

  private get length(): number {
    return this.sequence.length;
  }

  start(): void {
    this.phase = 'intro';
    this.endsAt = this.ctx.now() + this.cfg.introMs;
    this.ctx.markDirty();
  }

  update(): void {
    if (this.finished) return;
    const now = this.ctx.now();
    switch (this.phase) {
      case 'intro':
        if (now >= this.endsAt) this.beginRound();
        break;
      case 'watch':
        if (now >= this.endsAt) this.beginInput();
        break;
      case 'input':
        if (now >= this.closesAt || this.allResolved()) this.endRound();
        break;
      case 'result':
        if (now >= this.endsAt) {
          if (this.shouldEnd()) this.finish();
          else this.beginRound();
        }
        break;
      default:
        break;
    }
  }

  private activeIds(): string[] {
    return [...this.live.entries()].filter(([, l]) => l.status === 'active').map(([id]) => id);
  }

  private allResolved(): boolean {
    const connectedActive = this.activeIds().filter((id) => this.ctx.isConnected(id));
    if (connectedActive.length === 0) return true;
    return connectedActive.every((id) => {
      const l = this.live.get(id)!;
      return l.done || l.failed;
    });
  }

  private beginRound(): void {
    this.round++;
    // Classic Simon: the pattern grows by one fresh step per round (first round gets startLength).
    const want = this.cfg.startLength + (this.round - 1);
    while (this.sequence.length < want) this.sequence.push(this.ctx.rng.int(0, this.cfg.pads - 1));
    for (const l of this.live.values()) {
      l.progress = 0;
      l.done = false;
      l.failed = false;
    }
    this.roundResults = null;
    const now = this.ctx.now();
    this.phase = 'watch';
    this.showStartsAt = now + this.cfg.watchLeadMs;
    this.endsAt = this.showStartsAt + this.length * this.cfg.stepMs + 300;
    this.ctx.markDirty();
  }

  private beginInput(): void {
    const now = this.ctx.now();
    this.phase = 'input';
    this.inputStartsAt = now;
    this.endsAt = now + this.cfg.inputBaseMs + this.length * this.cfg.inputPerStepMs;
    this.closesAt = this.endsAt + this.cfg.latencyGraceMs;
    this.ctx.markDirty();
  }

  private endRound(): void {
    const results: EchoRoundResult[] = [];
    const budget = Math.max(1, this.endsAt - this.inputStartsAt);
    for (const id of this.activeIds()) {
      const l = this.live.get(id)!;
      if (l.done) {
        const finishMs = (this.finishTimes.get(id) ?? this.endsAt) - this.inputStartsAt;
        const frac = Math.max(0, Math.min(1, 1 - finishMs / budget));
        const speed = Math.round((this.cfg.maxSpeedBonus * frac) / 10) * 10;
        const points =
          this.cfg.basePoints + (this.length - this.cfg.startLength) * this.cfg.perExtraStepPoints + speed;
        this.scores.set(id, (this.scores.get(id) ?? 0) + points);
        this.roundsSurvived.set(id, (this.roundsSurvived.get(id) ?? 0) + 1);
        results.push({ playerId: id, completed: true, points });
      } else {
        // Wrong pad, timeout or disconnected: eliminated.
        l.status = 'out';
        results.push({ playerId: id, completed: false, points: 0 });
      }
    }
    this.finishTimes.clear();
    this.roundResults = results;
    this.phase = 'result';
    this.endsAt = this.ctx.now() + this.cfg.resultMs;
    this.ctx.markDirty();
  }

  private finishTimes = new Map<string, number>();

  private shouldEnd(): boolean {
    const remaining = this.activeIds().length;
    if (remaining === 0) return true;
    if (this.round >= this.cfg.maxRounds) return true;
    if (this.ctx.players.length >= 2 && remaining === 1) return true;
    return false;
  }

  private finish(): void {
    if (this.finished) return;
    const survivors = this.activeIds();
    if (this.ctx.players.length >= 2 && survivors.length === 1) {
      const id = survivors[0]!;
      this.scores.set(id, (this.scores.get(id) ?? 0) + this.cfg.survivorBonus);
    }
    this.finished = true;
    this.phase = 'done';
    this.ctx.markDirty();
    this.ctx.finish({
      scores: this.ctx.players.map((p) => ({
        playerId: p.id,
        score: this.scores.get(p.id) ?? 0,
        tiebreak: this.roundsSurvived.get(p.id) ?? 0,
      })),
      summary: {
        roundsPlayed: this.round,
        longestPattern: this.length,
        roundsSurvived: Object.fromEntries(this.roundsSurvived),
      },
    });
  }

  handleAction(playerId: string, action: RawAction): void {
    if (this.finished || action.type !== 'pad') return;
    const l = this.live.get(playerId);
    if (!l || l.status !== 'active') return;
    if (this.phase !== 'input') return this.ctx.sendTo(playerId, 'rejected', { reason: 'not-input-phase' });
    const now = this.ctx.now();
    if (now > this.closesAt) return this.ctx.sendTo(playerId, 'rejected', { reason: 'too-late' });
    if (l.done || l.failed) return;
    const pad = action.pad;
    if (typeof pad !== 'number' || !Number.isInteger(pad) || pad < 0 || pad >= this.cfg.pads) {
      return this.ctx.sendTo(playerId, 'rejected', { reason: 'invalid' });
    }
    if (pad === this.sequence[l.progress]) {
      l.progress++;
      if (l.progress >= this.length) {
        l.done = true;
        this.finishTimes.set(playerId, now);
        this.ctx.sendTo(playerId, 'pad', { ok: true, progress: l.progress, done: true });
      } else {
        this.ctx.sendTo(playerId, 'pad', { ok: true, progress: l.progress, done: false });
      }
    } else {
      l.failed = true;
      this.ctx.sendTo(playerId, 'pad', { ok: false, progress: l.progress, done: false });
    }
    this.ctx.markDirty();
  }

  getState(): EchoState {
    const players: Record<string, EchoPlayerState> = {};
    for (const [id, l] of this.live) {
      players[id] = { status: l.status, progress: l.progress, done: l.done };
    }
    const showSeq = this.phase === 'watch' || this.phase === 'result' || this.phase === 'done';
    return {
      phase: this.phase,
      round: this.round,
      maxRounds: this.cfg.maxRounds,
      length: this.length,
      pads: this.cfg.pads,
      sequence: showSeq ? [...this.sequence] : null,
      showStartsAt: this.showStartsAt,
      stepMs: this.cfg.stepMs,
      endsAt: this.endsAt,
      players,
      scores: Object.fromEntries(this.scores),
      roundResults: this.roundResults,
    };
  }

  onPlayerConnectionChange(): void {
    this.ctx.markDirty();
  }

  dispose(): void {
    this.finished = true;
  }
}

export const echoStepsPlugin: GamePlugin = {
  meta: echoStepsMeta,
  defaultConfig,
  stateIntervalMs: 120,
  createInstance: (ctx) => new EchoSteps(ctx),
};
