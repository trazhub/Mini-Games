/** Browser-safe surface of Lane Runner (no server code). The client (Task 9) imports from here. */
export { laneRunnerMeta } from './meta';
export * from './sim';
export type { LaneConfig, Row, RowSource, RunState } from './types';
