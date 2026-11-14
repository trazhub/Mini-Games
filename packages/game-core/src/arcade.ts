import { ARCADE, arcadeChunkSchema, type ArcadeChunk, type GameMeta } from '@minigamehub/shared';
import type { GameContext, GameInstance, GamePlugin, GameScore, RawAction } from './plugin';
import { TickTimers } from './timers';

/**
 * Arcade games run in the browser from a server-issued seed. The client records its inputs, sends
 * the log in chunks, and the server replays it through the same pure sim and keeps ITS OWN score.
 *
 * Log format (version-less, pinned by tests): a sequence of events, each encoded as
 *   varint(zigzag(tick - previousTick)) varint(code)
 * with previousTick starting at 0, then base64url-encoded without padding. Unsigned LEB128 varints,
 * at most 4 bytes (values < 2^28). Deltas are signed (zigzag) on purpose, so a hostile log CAN
 * express a backwards tick and the decoder rejects it instead of the format silently hiding it.
 */
export interface InputEvent {
  /** Simulation tick (0-based, at the sim's `hz`). Ticks are non-decreasing within a log. */
  tick: number;
  /** Game-defined input code, 0..255. */
  code: number;
}

const VARINT_MAX_BYTES = 4;
const VARINT_LIMIT = 2 ** (7 * VARINT_MAX_BYTES); // 2^28
const MAX_LOG_CHARS = Math.ceil((ARCADE.MAX_LOG_BYTES * 4) / 3);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));
const B64URL_RE = /^[A-Za-z0-9_-]*$/;

function pushVarint(out: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= VARINT_LIMIT) {
    throw new RangeError(`arcade log value out of range: ${value}`);
  }
  let v = value;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function toBase64url(bytes: readonly number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    s += B64[b0 >> 2];
    s += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) s += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) s += B64[b2 & 63];
  }
  return s;
}

/** Strict, canonical base64url (no padding, unused trailing bits must be zero). Null if invalid. */
function fromBase64url(s: string): number[] | null {
  if (!B64URL_RE.test(s) || s.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    acc = (acc << 6) | B64_INDEX[ch]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) return null; // non-canonical trailing bits
  return out;
}

/**
 * Encode an input log. Client-side helper: it encodes faithfully (including backwards ticks or
 * codes above 255, which the decoder rejects) and only throws for values the format cannot hold
 * (non-integers, negative codes, numbers >= 2^28). Use `ArcadeRecorder` to build valid logs.
 */
export function encodeInputLog(events: readonly InputEvent[]): string {
  const bytes: number[] = [];
  let prev = 0;
  for (const e of events) {
    if (!Number.isSafeInteger(e.tick)) throw new RangeError(`arcade tick must be an integer: ${e.tick}`);
    pushVarint(bytes, zigzag(e.tick - prev));
    pushVarint(bytes, e.code);
    prev = e.tick;
  }
  return toBase64url(bytes);
}

/**
 * Decode and validate an untrusted input log. Never throws. Returns null when the log is not strict
 * base64url, decodes to more than `ARCADE.MAX_LOG_BYTES`, has a truncated varint or a dangling
 * event, a tick < 0, a tick that goes backwards (equal ticks ARE allowed: two keys on one frame),
 * a tick > `maxTicks`, a code outside 0..255, or more than `ARCADE.MAX_EVENTS_PER_SEC` events
 * inside any window of `hz` consecutive ticks (one second of game time).
 *
 * `hz` defaults to 60, the arcade frame rate; servers always pass the sim's own `hz`.
 */
export function decodeInputLog(data: string, maxTicks: number, hz = 60): InputEvent[] | null {
  if (typeof data !== 'string' || data.length > MAX_LOG_CHARS) return null;
  if (!Number.isFinite(maxTicks) || !Number.isFinite(hz) || hz <= 0) return null;
  const bytes = fromBase64url(data);
  if (!bytes || bytes.length > ARCADE.MAX_LOG_BYTES) return null;

  let pos = 0;
  const readVarint = (): number | null => {
    let value = 0;
    let scale = 1;
    for (let k = 0; k < VARINT_MAX_BYTES; k++) {
      if (pos >= bytes.length) return null;
      const b = bytes[pos++]!;
      value += (b & 0x7f) * scale;
      if ((b & 0x80) === 0) return value;
      scale *= 0x80;
    }
    return null; // too long
  };

  const events: InputEvent[] = [];
  const window = Math.max(1, Math.round(hz));
  let tick = 0;
  let lo = 0; // first event index still inside the 1-second window ending at the current event
  while (pos < bytes.length) {
    const delta = readVarint();
    if (delta === null) return null;
    const code = readVarint();
    if (code === null) return null;
    tick += unzigzag(delta);
    const prev = events.at(-1);
    if (tick < 0 || tick > maxTicks || code > 255 || (prev && tick < prev.tick)) return null;
    events.push({ tick, code });
    while (tick - events[lo]!.tick >= window) lo++;
    if (events.length - lo > ARCADE.MAX_EVENTS_PER_SEC) return null;
  }
  return events;
}

/** Split an encoded log into protocol chunks of at most `ARCADE.CHUNK_CHARS`. An empty log is one empty chunk. */
export function splitChunks(log: string): ArcadeChunk[] {
  const n = Math.max(1, Math.ceil(log.length / ARCADE.CHUNK_CHARS));
  if (n > ARCADE.MAX_CHUNKS) throw new RangeError(`arcade log too long: ${log.length} chars`);
  return Array.from({ length: n }, (_, i) => ({ i, n, d: log.slice(i * ARCADE.CHUNK_CHARS, (i + 1) * ARCADE.CHUNK_CHARS) }));
}

/**
 * Server-side reassembly of one player's chunks. Memory is bounded by the schema (at most
 * `MAX_CHUNKS` x `CHUNK_CHARS`). Shape-invalid chunks, `i >= n` and duplicates are ignored (the first
 * copy of an index wins). A chunk whose `n` differs from the first accepted chunk poisons the
 * assembly: `rejected` becomes true and it never completes.
 */
export class ChunkAssembler {
  private n = 0;
  private parts: (string | undefined)[] = [];
  private count = 0;
  private poisoned = false;

  get rejected(): boolean {
    return this.poisoned;
  }

  add(c: ArcadeChunk): void {
    if (this.poisoned) return;
    const parsed = arcadeChunkSchema.safeParse(c);
    if (!parsed.success) return;
    const { i, n, d } = parsed.data;
    if (this.n === 0) {
      this.n = n;
      this.parts = new Array<string | undefined>(n);
    } else if (n !== this.n) {
      this.poisoned = true;
      this.parts = [];
      return;
    }
    if (this.parts[i] !== undefined) return;
    this.parts[i] = d;
    this.count++;
  }

  complete(): boolean {
    return !this.poisoned && this.n > 0 && this.count === this.n;
  }

  join(): string | null {
    return this.complete() ? this.parts.join('') : null;
  }
}

/** Pure, deterministic game simulation shared by the browser and the server. */
export interface ArcadeSim<Cfg> {
  /** Simulation ticks per second. */
  hz: number;
  /** Hard cap on the run length in ticks for this config. */
  maxTicks(cfg: Cfg): number;
  /** Replay a validated input log from the seed. Must be deterministic and side-effect free. */
  replay(seed: number, cfg: Cfg, events: InputEvent[]): { score: number; ticks: number };
}

export interface ArcadeState<Cfg = Record<string, unknown>> {
  seed: number;
  config: Cfg;
  /** Server epoch ms after which missing submissions score 0. */
  deadline: number;
  /** Players whose log has been received and verified (no scores until the end). */
  submitted: string[];
}

const MAX_SEED = 2147483647;
const MAX_SCORE = 2147483647;

class ArcadeGame<Cfg extends Record<string, unknown>> implements GameInstance {
  private readonly cfg: Cfg;
  private readonly seed: number;
  private readonly runMs: number;
  private readonly participants: Set<string>;
  private readonly timers = new TickTimers();
  private readonly assemblers = new Map<string, ChunkAssembler>();
  private readonly scores = new Map<string, number>();
  /** Participants permanently gone (kicked or reconnect grace expired). Only they stop counting. */
  private readonly removed = new Set<string>();
  private deadline = 0;
  private started = false;
  private finished = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly sim: ArcadeSim<Cfg>,
    defaultConfig: Cfg,
  ) {
    this.cfg = { ...defaultConfig, ...ctx.config } as Cfg;
    const s = this.cfg.seed;
    this.seed = typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= MAX_SEED ? s : ctx.rng.int(1, MAX_SEED);
    const maxTicks = sim.maxTicks(this.cfg);
    if (!Number.isFinite(maxTicks) || maxTicks <= 0 || !Number.isFinite(sim.hz) || sim.hz <= 0) {
      throw new Error('arcade sim must have a positive hz and maxTicks');
    }
    this.runMs = Math.ceil((maxTicks / sim.hz) * 1000);
    this.participants = new Set(ctx.players.map((p) => p.id));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const total = this.runMs + ARCADE.SUBMIT_GRACE_MS;
    this.deadline = this.ctx.now() + total;
    this.timers.after(total, () => this.finish());
    this.ctx.broadcast('arcade:start', { seed: this.seed, config: this.cfg, deadlineMs: this.deadline });
    this.ctx.markDirty();
  }

  update(dtMs: number): void {
    if (this.finished || !this.started) return;
    this.timers.tick(dtMs);
    // Backstop on the server clock in case ticks were throttled.
    if (!this.finished && this.ctx.now() >= this.deadline) this.finish();
  }

  handleAction(playerId: string, action: RawAction): void {
    if (this.finished || !this.started) return;
    if (typeof action !== 'object' || action === null || action.type !== 'arcade:chunk') return;
    if (!this.participants.has(playerId) || this.removed.has(playerId) || this.scores.has(playerId)) return;
    const chunk = arcadeChunkSchema.safeParse({ i: action.i, n: action.n, d: action.d });
    if (!chunk.success) return;
    let asm = this.assemblers.get(playerId);
    if (!asm) {
      asm = new ChunkAssembler();
      this.assemblers.set(playerId, asm);
    }
    asm.add(chunk.data);
    if (asm.rejected) return this.record(playerId, 0);
    const log = asm.join();
    if (log === null) return;
    this.record(playerId, this.verify(log));
  }

  /** Replay the log and return the server's score; 0 for any invalid log or misbehaving sim. */
  private verify(log: string): number {
    try {
      const events = decodeInputLog(log, this.sim.maxTicks(this.cfg), this.sim.hz);
      if (!events) return 0;
      const { score } = this.sim.replay(this.seed, this.cfg, events);
      // Non-negative int4 (game_scores.best is an integer column); non-finite -> 0.
      return Number.isFinite(score) ? Math.max(0, Math.min(MAX_SCORE, Math.floor(score))) : 0;
    } catch {
      return 0;
    }
  }

  private record(playerId: string, score: number): void {
    this.scores.set(playerId, score);
    this.assemblers.delete(playerId);
    this.ctx.markDirty();
    this.maybeFinishEarly();
  }

  /**
   * Finish early once every participant that has not been removed has submitted. A disconnected
   * (but not removed) player still counts: a momentary socket drop must not zero a live run. They
   * stop counting when the room removes them (reconnect grace expired, kicked); otherwise the
   * deadline ends the match, so nothing can hang.
   */
  private maybeFinishEarly(): void {
    if (this.finished || !this.started) return;
    for (const id of this.participants) {
      if (!this.removed.has(id) && !this.scores.has(id)) return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.timers.clear();
    this.assemblers.clear();
    const scores: GameScore[] = this.ctx.players.map((p) => ({ playerId: p.id, score: this.scores.get(p.id) ?? 0 }));
    this.ctx.markDirty();
    this.ctx.finish({ scores, summary: { seed: this.seed } });
  }

  getState(): ArcadeState<Cfg> {
    return {
      seed: this.seed,
      config: this.cfg,
      deadline: this.deadline,
      submitted: [...this.participants].filter((id) => this.scores.has(id)),
    };
  }

  onPlayerConnectionChange(playerId: string, connected: boolean): void {
    // A reconnecting client resends its whole log: drop any partial assembly from before the drop.
    if (connected) this.assemblers.delete(playerId);
    this.ctx.markDirty();
  }

  onPlayerRemoved(playerId: string): void {
    if (!this.participants.has(playerId)) return;
    this.removed.add(playerId);
    this.assemblers.delete(playerId);
    this.maybeFinishEarly();
  }

  dispose(): void {
    this.finished = true;
    this.timers.clear();
    this.assemblers.clear();
  }
}

/** Build a server plugin for an arcade game from its pure sim. */
export function createArcadePlugin<Cfg extends Record<string, unknown>>(def: {
  meta: GameMeta;
  defaultConfig: Cfg;
  sim: ArcadeSim<Cfg>;
}): GamePlugin {
  return {
    meta: def.meta,
    defaultConfig: def.defaultConfig,
    stateIntervalMs: 250,
    createInstance: (ctx) => new ArcadeGame(ctx, def.sim, def.defaultConfig),
  };
}
