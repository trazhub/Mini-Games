import type { ArcadeChunk, GameMeta, PlayerPublic } from '@minigamehub/shared';

export type ClientAction = { type: string; [k: string]: string | number | boolean | null };

export type SfxName = 'tap' | 'good' | 'bad' | 'win' | 'tick' | 'go' | 'pad0' | 'pad1' | 'pad2' | 'pad3';

export interface GameEventMessage {
  type: string;
  [k: string]: unknown;
}

/**
 * Everything a game's browser UI receives from the platform. Game UIs are pure views of
 * server state: they send intents through `send` and never decide outcomes.
 */
export interface GameClientProps<S = unknown> {
  meta: GameMeta;
  /** Latest full state pushed by the server (`game:state`); null until the first push. */
  state: S | null;
  /** Current player id. */
  me: string;
  /** True when watching a match you are not part of (joined late). */
  spectator: boolean;
  players: PlayerPublic[];
  participantIds: string[];
  /** Match id: changes on every (re)match so UIs can reset local state. */
  matchId: string;
  send: (action: ClientAction) => void;
  /** Subscribe to high-frequency/transient server events. Returns an unsubscribe function. */
  subscribe: (listener: (e: GameEventMessage) => void) => () => void;
  /** Estimated server epoch ms (clock-synced). Use for countdown display only. */
  serverNow: () => number;
  /** Publish live scores for the platform's scoreboard. */
  reportScores: (scores: Record<string, number>) => void;
  reducedMotion: boolean;
  sfx: (name: SfxName) => void;
  /**
   * Arcade games only: send one chunk of the recorded input log (`ArcadeRecorder.finish()`) as a
   * `C2S.arcade` message. Other games ignore it. Sending the same chunk set again is harmless (the
   * server ignores a finished submission), which is how a UI retries after a reconnect.
   */
  sendArcade: (chunk: ArcadeChunk) => void;
}
