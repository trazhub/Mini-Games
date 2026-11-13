import type { GamePlugin } from '@minigamehub/game-core';
import type { ServerConfig } from './config';
import type { Repository } from './db/repository';
import type { Metrics } from './metrics';
import type { KeyedWindowLimiter } from './ratelimit';

export interface Timing {
  startDelayMs: number;
  graceMs: number;
  hostMigrationMs: number;
  idleTtlMs: number;
  maxLifetimeMs: number;
  resultsAutoReturnMs: number;
  /** Rooms that nobody ever joined are removed after this long. */
  unclaimedTtlMs: number;
}

export interface RoomStats {
  code: string;
  phase: string;
  members: number;
  connected: number;
  gameId: string | null;
}

export interface RoomHandle {
  stats(): RoomStats;
}

/**
 * Process-wide dependencies for PartyRoom instances. Colyseus constructs rooms itself, so the
 * server wiring (config, DB, game registry) is handed over through this holder. One server per
 * process - tests that need several run them sequentially via `setRuntime`.
 */
export interface Runtime {
  config: ServerConfig;
  repo: Repository;
  games: Map<string, GamePlugin>;
  timing: Timing;
  /** Per-game config overrides (ops / tests). Never client-controlled. */
  gameConfig: Record<string, Record<string, unknown>>;
  joinLimiter: KeyedWindowLimiter;
  metrics: Metrics;
  codes: Set<string>;
  rooms: Set<RoomHandle>;
}

let current: Runtime | null = null;

export function setRuntime(r: Runtime): void {
  current = r;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error('Server runtime not initialised');
  return current;
}
