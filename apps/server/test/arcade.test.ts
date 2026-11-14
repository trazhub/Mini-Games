import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { ArcadeRecorder, createArcadePlugin, splitChunks, type ArcadeSim } from '@minigamehub/game-core';
import { LANE_LEFT, LANE_RIGHT, createRun, defaultLaneConfig, laneRunnerSim, runScore, stepRun } from '@minigamehub/game-lane-runner';
import type { BestsResponse, GameMeta } from '@minigamehub/shared';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepository } from '../src/db/repository';
import { ALL_GAMES } from '../src/games';
import { Bot, makeParty, sleep, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const counterMeta: GameMeta = {
  id: 'counter',
  name: 'Counter',
  tagline: 'Test double',
  description: 'Arcade test double: score = number of recorded inputs.',
  category: 'reaction',
  kind: 'arcade',
  solo: true,
  tags: [],
  minPlayers: 1,
  maxPlayers: 4,
  durationMinutes: [0, 1],
  controls: { keyboard: [], touch: [] },
  rules: [],
  mobileFriendly: true,
  accent: '#ffffff',
};

const counterSim: ArcadeSim<{ ticks: number }> = {
  hz: 30,
  maxTicks: (cfg) => cfg.ticks,
  replay: (_seed, _cfg, events) => ({ score: events.length, ticks: events.at(-1)?.tick ?? 0 }),
};

// 300 ticks at 30 Hz: the deadline (10 s + grace) is far away, so early finishes are real finishes.
const counterPlugin = createArcadePlugin({ meta: counterMeta, defaultConfig: { ticks: 300 }, sim: counterSim });

let srv: TestServer;
const bots: Bot[] = [];
const track = <T extends Bot[]>(list: T): T => (bots.push(...list), list);

beforeAll(async () => {
  srv = await startTestServer({ games: [counterPlugin], timing: { startDelayMs: 50 } });
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
});

async function startCounter(host: Bot, players: Bot[]) {
  host.send('selectGame', { gameId: 'counter' });
  await host.until((b) => b.party!.selectedGameId === 'counter', 3000, 'game selected');
  host.send('start');
  await Promise.all(players.map((p) => p.until((b) => !!b.gameState && b.eventsOf('arcade:start').length > 0, 5000, 'arcade started')));
}

function honestChunks(n: number) {
  const rec = new ArcadeRecorder(counterSim.hz);
  for (let k = 0; k < n; k++) rec.record(k * 10, k % 3);
  return rec.finish();
}

const scoreOf = (b: Bot, id: string) => b.results!.rankings.find((r) => r.playerId === id)!.score;

describe('arcade protocol through a real room', () => {
  it('a real client run is verified end to end', async () => {
    const [host] = track([await new Bot(srv.url, 'Runner').create()]);
    await startCounter(host!, [host!]);
    const start = host!.eventsOf('arcade:start')[0]!;
    expect(start.seed).toBe(host!.gameState.seed);
    expect(start.config).toMatchObject({ ticks: 300 });
    expect(start.deadlineMs).toBe(host!.gameState.deadline);
    expect(host!.gameState.submitted).toEqual([]);

    // The claimed score rides along and is ignored: the server replays the log.
    for (const c of honestChunks(3)) host!.send('arcade:chunk', { ...c, score: 999999 });
    await host!.until((b) => !!b.results, 5000, 'results');
    expect(scoreOf(host!, host!.playerId)).toBe(3);
    expect(host!.results!.summary).toEqual({ seed: start.seed });
  });

  it('a hostile client sending 17 chunks is struck and the match still ends', async () => {
    const [host, hostile] = track(await makeParty(srv.url, 2));
    await startCounter(host!, [host!, hostile!]);
    const malformedBefore = srv.app.runtime.metrics.counters.malformed;

    // 16 non-base64url chunks complete a set (decode fails -> 0); the 17th (i = 16) fails the schema.
    for (let i = 0; i <= 16; i++) hostile!.send('arcade:chunk', { i, n: 16, d: '!!!!' });
    await host!.until((b) => b.gameState?.submitted?.includes(hostile!.playerId), 5000, 'hostile counted as submitted');
    expect(host!.results).toBeNull(); // the honest player is not blocked or cut short
    expect(srv.app.runtime.metrics.counters.malformed - malformedBefore).toBeGreaterThanOrEqual(1);

    for (const c of honestChunks(4)) host!.send('arcade:chunk', c);
    await host!.until((b) => !!b.results, 5000, 'results');
    expect(scoreOf(host!, host!.playerId)).toBe(4);
    expect(scoreOf(host!, hostile!.playerId)).toBe(0);
    expect(hostile!.leftCode).toBeNull(); // one strike is not a disconnect
  });

  it('garbage chunk payloads never crash the room', async () => {
    const [host, junk] = track(await makeParty(srv.url, 2));
    await startCounter(host!, [host!, junk!]);
    const malformedBefore = srv.app.runtime.metrics.counters.malformed;
    const payloads: unknown[] = [
      null,
      42,
      'str',
      [],
      {},
      { i: '0', n: 1, d: '' },
      { i: 0, n: 1 },
      { i: 0, n: 1, d: 5 },
      { i: -1, n: 1, d: '' },
      { i: 0, n: 1, d: 'x'.repeat(1401) },
      { i: 3, n: 2, d: 'AA' },
    ];
    for (const p of payloads) {
      try {
        junk!.send('arcade:chunk', p);
      } catch {
        /* the client library may refuse to encode some values */
      }
    }
    // Enough strikes disconnect the sender; the room keeps running.
    await junk!.until((b) => b.leftCode !== null, 5000, 'junk sender disconnected');
    expect(srv.app.runtime.metrics.counters.malformed - malformedBefore).toBeGreaterThanOrEqual(8);
    expect(host!.party!.phase).toBe('playing');

    // The disconnected player only delays the end until the room removes them (reconnect grace,
    // 2.5 s in tests); they never block the honest one past that.
    for (const c of honestChunks(2)) host!.send('arcade:chunk', c);
    await host!.until((b) => !!b.results, 8000, 'results');
    expect(scoreOf(host!, host!.playerId)).toBe(2);
    expect(scoreOf(host!, junk!.playerId)).toBe(0);
  });

  it("a spectator's chunk is ignored", async () => {
    const [host] = track([await new Bot(srv.url, 'Player').create()]);
    await startCounter(host!, [host!]);
    const [spectator] = track([await new Bot(srv.url, 'Watcher').join(host!.party!.code)]);
    await spectator!.until((b) => !!b.gameState, 5000, 'spectator state');
    const malformedBefore = srv.app.runtime.metrics.counters.malformed;

    for (const c of splitChunks('')) spectator!.send('arcade:chunk', c);
    for (const c of honestChunks(5)) spectator!.send('arcade:chunk', c);
    await sleep(300);
    expect(host!.results).toBeNull();
    expect(host!.gameState.submitted).toEqual([]);
    expect(srv.app.runtime.metrics.counters.malformed).toBe(malformedBefore); // valid shape: ignored, not struck

    for (const c of honestChunks(1)) host!.send('arcade:chunk', c);
    await host!.until((b) => !!b.results, 5000, 'results');
    expect(host!.results!.rankings.map((r) => r.playerId)).toEqual([host!.playerId]);
    expect(scoreOf(host!, host!.playerId)).toBe(1);
  });
});

describe('lane runner through the real registry', () => {
  it('lane runner solo run through a real room records a solo best', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    const real = await startTestServer({ repo: createPgRepository(db, async () => {}), games: ALL_GAMES, timing: { startDelayMs: 50 } });
    try {
      const [host] = track([await new Bot(real.url, 'Runner').create()]);
      host!.send('selectGame', { gameId: 'lane-runner' });
      await host!.until((b) => b.party!.selectedGameId === 'lane-runner', 3000, 'game selected');
      host!.send('start');
      await host!.until((b) => !!b.gameState && b.eventsOf('arcade:start').length > 0, 5000, 'arcade started');
      const seed = host!.eventsOf('arcade:start')[0]!.seed as number;

      // A perfect run recorded the way the client will: aim for the next row's coin or nearest free lane.
      const run = createRun(seed, defaultLaneConfig);
      const rec = new ArcadeRecorder(laneRunnerSim.hz);
      while (!run.done) {
        const row = run.rows[0]!;
        const free = [0, 1, 2].filter((l) => (row.mask & (1 << l)) === 0);
        const target = row.coin >= 0 ? row.coin : free.reduce((a, b) => (Math.abs(b - run.lane) < Math.abs(a - run.lane) ? b : a));
        const code = run.lane > target ? LANE_LEFT : run.lane < target ? LANE_RIGHT : null;
        if (code !== null) expect(rec.record(run.tick, code)).toBe(true);
        stepRun(run, code);
      }
      const expected = runScore(run);
      expect(expected).toBeGreaterThan(1000);

      for (const c of rec.finish()) host!.send('arcade:chunk', { ...c, score: 1 });
      await host!.until((b) => !!b.results, 5000, 'results');
      expect(host!.results!.gameId).toBe('lane-runner');
      expect(scoreOf(host!, host!.playerId)).toBe(expected);

      // recordScores is fire-and-forget on the server; poll until the row shows up.
      const getBests = async () =>
        (await (await fetch(`${real.url}/api/me/bests`, { headers: { authorization: `Bearer ${host!.token}` } })).json()) as BestsResponse;
      let got = await getBests();
      // Bounded below the 60/min lookup limit on /api/me.
      for (let i = 0; i < 30 && got.bests.length === 0; i++) {
        await sleep(100);
        got = await getBests();
      }
      expect(got.bests).toEqual([{ gameId: 'lane-runner', mode: 'solo', best: expected, plays: 1 }]);
    } finally {
      await real.close();
      await client.close();
    }
  });
});
