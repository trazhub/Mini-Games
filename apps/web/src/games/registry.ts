import type { GameClientProps } from '@minigamehub/game-core';
import { echoStepsMeta } from '@minigamehub/game-echo-steps/meta';
import { laneRunnerMeta } from '@minigamehub/game-lane-runner/meta';
import { majorityTrapMeta } from '@minigamehub/game-majority-trap/meta';
import { orbitSwapMeta } from '@minigamehub/game-orbit-swap/meta';
import type { GameMeta } from '@minigamehub/shared';
import type { ComponentType } from 'react';

export interface ClientGame {
  meta: GameMeta;
  /** Lazy loader: each game (and Phaser for Orbit Swap) is its own chunk. */
  load: () => Promise<{ default: ComponentType<GameClientProps> }>;
}

/**
 * THE client-side game registry. Adding a game = create `games/<id>` and add one entry here
 * (plus its server plugin in apps/server/src/games.ts). See docs/ADDING_A_GAME.md.
 */
export const GAMES: readonly ClientGame[] = [
  { meta: majorityTrapMeta, load: () => import('@minigamehub/game-majority-trap/client') as never },
  { meta: echoStepsMeta, load: () => import('@minigamehub/game-echo-steps/client') as never },
  { meta: orbitSwapMeta, load: () => import('@minigamehub/game-orbit-swap/client') as never },
  { meta: laneRunnerMeta, load: () => import('@minigamehub/game-lane-runner/client') as never },
];

export const GAME_BY_ID: Record<string, ClientGame> = Object.fromEntries(GAMES.map((g) => [g.meta.id, g]));

export function playerRange(meta: GameMeta): string {
  return meta.minPlayers === meta.maxPlayers ? `${meta.minPlayers} players` : `${meta.minPlayers}-${meta.maxPlayers} players`;
}
