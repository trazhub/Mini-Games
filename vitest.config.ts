import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/test/**/*.test.ts', 'packages/**/*.test.ts', 'games/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'threads',
    // Integration tests boot real servers; keep files isolated and modest in parallelism.
    maxWorkers: 3,
  },
});
