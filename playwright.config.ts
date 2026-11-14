import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the PRODUCTION build served under the GitHub Pages sub-path (/Mini-Games/)
 * plus a real game server, so the static build, base path, hash routing and CORS are all
 * exercised exactly as they will be in production (minus the public internet).
 */
const WEB = 'http://localhost:4180';
export const BASE_URL = `${WEB}/Mini-Games/`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: "mobile",
      testMatch: /(?:mobile|lane-runner).spec.ts/,
      use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" },
    },
    // Uses the locally installed Chrome so no browser download is needed; falls back to bundled Chromium in CI.
    { name: 'desktop', testMatch: /(?:desktop|arcade|lane-runner).spec.ts/, use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } },
  ],
  webServer: [
    {
      command: 'npx tsx apps/server/src/main.ts',
      url: 'http://localhost:2567/health',
      // Never reuse: a stray dev server has different CORS origins/timings and would silently fail the tests.
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: '2567',
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: WEB,
        START_DELAY_MS: '600',
        JOIN_RATE_PER_MIN: '500',
        GUEST_RATE_PER_MIN: '500',
        RESULTS_AUTO_RETURN_MS: '120000',
        GAME_CONFIG_OVERRIDES: JSON.stringify({
          'majority-trap': { rounds: 2, introMs: 600, answerMs: 12000, revealMs: 1500, latencyGraceMs: 300 },
          'echo-steps': { introMs: 600, watchLeadMs: 300, stepMs: 300, inputBaseMs: 5000, maxRounds: 3, resultMs: 800 },
          'orbit-swap': { matchMs: 7000, countdownMs: 800 },
        }),
      },
    },
    {
      command: 'npm run build -w @minigamehub/web && npm run preview -w @minigamehub/web -- --port 4180 --strictPort',
      url: BASE_URL,
      // Never reuse: a stray dev server has different CORS origins/timings and would silently fail the tests.
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
