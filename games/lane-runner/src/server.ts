import { createArcadePlugin } from '@minigamehub/game-core';
import { laneRunnerMeta } from './meta';
import { defaultLaneConfig, laneRunnerSim } from './sim';
import type { LaneConfig } from './types';

export const laneRunnerPlugin = createArcadePlugin<LaneConfig>({
  meta: laneRunnerMeta,
  defaultConfig: defaultLaneConfig,
  sim: laneRunnerSim,
});
