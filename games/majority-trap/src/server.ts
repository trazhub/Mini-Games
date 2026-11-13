import type { GameContext, GameInstance, GamePlugin, RawAction } from '@minigamehub/game-core';
import { majorityTrapMeta } from './meta';
import { QUESTIONS, type Question } from './questions';
import { scoreRound, type Choice, type RoundOutcome, type Submission } from './scoring';
import type { MajorityPhase, MajorityState } from './types';

export const defaultConfig = {
  rounds: 5,
  introMs: 2500,
  answerMs: 15000,
  revealMs: 7000,
  /** Extra time the server still accepts answers after the displayed deadline (latency fairness). */
  latencyGraceMs: 400,
};

type Config = typeof defaultConfig;

function isChoice(v: unknown): v is Choice {
  return v === 'A' || v === 'B';
}

class MajorityTrap implements GameInstance {
  private cfg: Config;
  private phase: MajorityPhase = 'intro';
  private round = 0;
  private endsAt = 0;
  /** Moment the server stops accepting answers (endsAt + grace). */
  private closesAt = 0;
  private questions: Question[];
  private submissions = new Map<string, Submission>();
  private outcome: RoundOutcome | null = null;
  private scores = new Map<string, number>();
  private correctPredictions = new Map<string, number>();
  private history: { question: string; counts: { A: number; B: number }; minority: Choice | null }[] = [];
  private finished = false;

  constructor(private ctx: GameContext) {
    this.cfg = { ...defaultConfig, ...(ctx.config as Partial<Config>) };
    const total = Math.max(1, Math.min(this.cfg.rounds, QUESTIONS.length));
    this.cfg.rounds = total;
    this.questions = ctx.rng.shuffle(QUESTIONS).slice(0, total);
    for (const p of ctx.players) {
      this.scores.set(p.id, 0);
      this.correctPredictions.set(p.id, 0);
    }
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
      case 'question':
        if (now >= this.closesAt || this.allConnectedSubmitted()) this.reveal();
        break;
      case 'reveal':
        if (now >= this.endsAt) {
          if (this.round >= this.questions.length) this.finish();
          else this.beginRound();
        }
        break;
      default:
        break;
    }
  }

  private allConnectedSubmitted(): boolean {
    const active = this.ctx.players.filter((p) => this.ctx.isConnected(p.id));
    // If nobody is connected, don't spin: let the timer expire.
    return active.length > 0 && active.every((p) => this.submissions.has(p.id));
  }

  private beginRound(): void {
    this.round++;
    this.phase = 'question';
    this.submissions = new Map();
    this.outcome = null;
    this.endsAt = this.ctx.now() + this.cfg.answerMs;
    this.closesAt = this.endsAt + this.cfg.latencyGraceMs;
    this.ctx.markDirty();
  }

  private reveal(): void {
    this.outcome = scoreRound(this.submissions);
    for (const row of this.outcome.rows) {
      this.scores.set(row.playerId, (this.scores.get(row.playerId) ?? 0) + row.points);
      if (row.predictionCorrect) {
        this.correctPredictions.set(row.playerId, (this.correctPredictions.get(row.playerId) ?? 0) + 1);
      }
    }
    const q = this.currentQuestion();
    this.history.push({ question: q?.text ?? '', counts: this.outcome.counts, minority: this.outcome.minority });
    this.phase = 'reveal';
    this.endsAt = this.ctx.now() + this.cfg.revealMs;
    this.ctx.markDirty();
  }

  private currentQuestion(): Question | null {
    return this.questions[this.round - 1] ?? null;
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    this.ctx.markDirty();
    this.ctx.finish({
      scores: this.ctx.players.map((p) => ({
        playerId: p.id,
        score: this.scores.get(p.id) ?? 0,
        tiebreak: this.correctPredictions.get(p.id) ?? 0,
      })),
      summary: {
        rounds: this.history,
        correctPredictions: Object.fromEntries(this.correctPredictions),
      },
    });
  }

  handleAction(playerId: string, action: RawAction): void {
    if (this.finished || action.type !== 'answer') return;
    if (this.phase !== 'question') return reject(this.ctx, playerId, 'not-accepting');
    if (!this.scores.has(playerId)) return; // not a participant
    if (this.ctx.now() > this.closesAt) return reject(this.ctx, playerId, 'too-late');
    if (this.submissions.has(playerId)) return reject(this.ctx, playerId, 'already-submitted');
    const { answer, predict } = action;
    if (!isChoice(answer) || !isChoice(predict)) return reject(this.ctx, playerId, 'invalid');
    this.submissions.set(playerId, { answer, predict });
    this.ctx.markDirty();
  }

  getState(viewerId: string | null): MajorityState {
    const q = this.phase === 'question' || this.phase === 'reveal' ? this.currentQuestion() : null;
    const mine = viewerId ? (this.submissions.get(viewerId) ?? null) : null;
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.questions.length,
      endsAt: this.endsAt,
      question: q ? { id: q.id, text: q.text, a: q.a, b: q.b } : null,
      submitted: [...this.submissions.keys()],
      mine: mine ? { answer: mine.answer, predict: mine.predict } : null,
      reveal: this.phase === 'reveal' && this.outcome ? this.outcome : null,
      scores: Object.fromEntries(this.scores),
    };
  }

  onPlayerConnectionChange(): void {
    // A disconnect may complete the "everyone submitted" condition; update() re-checks next tick.
    this.ctx.markDirty();
  }

  dispose(): void {
    this.finished = true;
  }
}

function reject(ctx: GameContext, playerId: string, reason: string): void {
  ctx.sendTo(playerId, 'rejected', { reason });
}

export const majorityTrapPlugin: GamePlugin = {
  meta: majorityTrapMeta,
  defaultConfig,
  stateIntervalMs: 100,
  createInstance: (ctx) => new MajorityTrap(ctx),
};
