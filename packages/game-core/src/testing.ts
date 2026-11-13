import type { AvatarId } from '@minigamehub/shared';
import type { GameContext, GamePlayer, GamePlugin, GameResult, GameInstance } from './plugin';
import { createRng } from './rng';

export interface Sent {
  to: string | '*';
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Headless harness that drives a plugin without sockets or a party room.
 * Used by game unit tests and documented in docs/ADDING_A_GAME.md.
 */
export class GameHarness {
  readonly sent: Sent[] = [];
  result: GameResult | null = null;
  dirtyCount = 0;
  clock = 1_000_000;
  connected = new Set<string>();
  instance: GameInstance;
  players: GamePlayer[];

  constructor(plugin: GamePlugin, playerCount: number, config: Record<string, unknown> = {}, seed = 1) {
    this.players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      avatar: 'comet' as AvatarId,
    }));
    for (const p of this.players) this.connected.add(p.id);
    const ctx: GameContext = {
      matchId: 'test-match',
      players: this.players,
      config: { ...plugin.defaultConfig, ...config },
      rng: createRng(seed),
      now: () => this.clock,
      isConnected: (id) => this.connected.has(id),
      broadcast: (type, payload) => this.sent.push({ to: '*', type, payload }),
      sendTo: (to, type, payload) => this.sent.push({ to, type, payload }),
      markDirty: () => {
        this.dirtyCount++;
      },
      finish: (r) => {
        this.result ??= r;
      },
    };
    this.instance = plugin.createInstance(ctx);
  }

  /** Advance simulated time in 33ms ticks. */
  advance(ms: number, step = 33): void {
    let left = ms;
    while (left > 0) {
      const dt = Math.min(step, left);
      this.clock += dt;
      this.instance.update(dt);
      left -= dt;
    }
  }

  events(type: string): Sent[] {
    return this.sent.filter((s) => s.type === type);
  }
}
