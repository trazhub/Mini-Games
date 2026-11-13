import type { GamePlugin } from '@minigamehub/game-core';
import { echoStepsPlugin } from '@minigamehub/game-echo-steps/server';
import { laneRunnerPlugin } from '@minigamehub/game-lane-runner/server';
import { majorityTrapPlugin } from '@minigamehub/game-majority-trap/server';
import { orbitSwapPlugin } from '@minigamehub/game-orbit-swap/server';

/**
 * THE server-side game registry. Adding a game = create `games/<id>` and add its plugin here
 * (plus one line in apps/web/src/games/registry.ts). See docs/ADDING_A_GAME.md.
 */
export const ALL_GAMES: readonly GamePlugin[] = [majorityTrapPlugin, echoStepsPlugin, orbitSwapPlugin, laneRunnerPlugin];

export function buildGameMap(games: readonly GamePlugin[] = ALL_GAMES): Map<string, GamePlugin> {
  const map = new Map<string, GamePlugin>();
  for (const g of games) {
    if (map.has(g.meta.id)) throw new Error(`Duplicate game id: ${g.meta.id}`);
    map.set(g.meta.id, g);
  }
  return map;
}
