import type { AvatarId, GameMeta } from '@minigamehub/shared';
import type { Rng } from './rng';

export interface GamePlayer {
  id: string;
  name: string;
  avatar: AvatarId;
}

/** Raw score entry produced by a game. The party converts it into ranks and party points. */
export interface GameScore {
  playerId: string;
  score: number;
  /** Optional tie-breaker: higher wins when scores are equal. */
  tiebreak?: number;
}

export interface GameResult {
  scores: GameScore[];
  /** Extra data shown on the results screen (must be JSON serialisable). */
  summary?: Record<string, unknown>;
}

/** Action payload after generic shape validation. Plugins MUST still validate it. */
export type RawAction = { type: string; [k: string]: string | number | boolean | null };

/**
 * Services the party room provides to a running game. A game never touches sockets, the party
 * roster, the database or wall-clock timers directly - everything goes through this context.
 */
export interface GameContext {
  readonly matchId: string;
  /** Participating players (spectators are not included). Snapshot at match start. */
  readonly players: readonly GamePlayer[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly rng: Rng;
  /** Server epoch milliseconds. Games must use this rather than trusting any client time. */
  now(): number;
  isConnected(playerId: string): boolean;
  /** Send an event to every participant and spectator. */
  broadcast(type: string, payload?: Record<string, unknown>): void;
  /** Send an event to a single player. */
  sendTo(playerId: string, type: string, payload?: Record<string, unknown>): void;
  /**
   * Mark the state returned by `getState` as changed. The party throttles and pushes a
   * `game:state` message to each client (per-viewer, so private data stays private).
   */
  markDirty(): void;
  /** Finish the match. Idempotent: only the first call has an effect. */
  finish(result: GameResult): void;
}

export interface GameInstance {
  /** Called once, after every client has had time to load the game. */
  start(): void;
  /** Fixed ~30Hz server tick. `dtMs` is the elapsed time since the previous tick. */
  update(dtMs: number): void;
  /**
   * Handle an untrusted action from a participant. Must never throw for malformed input -
   * invalid actions are ignored (or answered with an event) and counted by `ctx`.
   */
  handleAction(playerId: string, action: RawAction): void;
  /**
   * Full state for one viewer (`null` = spectator). Used for (re)joins and dirty pushes.
   * Never include data the viewer must not see yet (e.g. other players' secret answers).
   */
  getState(viewerId: string | null): unknown;
  onPlayerConnectionChange?(playerId: string, connected: boolean): void;
  /** Player permanently left the party (kicked or grace expired). */
  onPlayerRemoved?(playerId: string): void;
  /** Release timers/handles. Called when the match ends or the party is destroyed. */
  dispose(): void;
}

export interface GamePlugin {
  meta: GameMeta;
  /** Server-side tunables (durations, round counts...). Overridable by ops/tests, never by clients. */
  defaultConfig: Record<string, unknown>;
  /** Minimum ms between dirty `game:state` pushes. Defaults to 100. */
  stateIntervalMs?: number;
  createInstance(ctx: GameContext): GameInstance;
}
