import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { GameInstance, GamePlugin } from '@minigamehub/game-core';
import type { BestsResponse } from '@minigamehub/shared';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepository, noopRepository, type Repository } from '../src/db/repository';
import { Bot, getGuest, sleep, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Finishes as soon as it starts, every participant scoring 120. */
const soloTest: GamePlugin = {
  meta: {
    id: 'solo-test',
    name: 'Solo Test',
    tagline: 'Test double',
    description: 'Finishes immediately; used to verify personal bests.',
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
  },
  defaultConfig: {},
  createInstance(ctx): GameInstance {
    return {
      start() {
        ctx.finish({ scores: ctx.players.map((p) => ({ playerId: p.id, score: 120 })) });
      },
      update() {},
      handleAction() {},
      getState: () => ({}),
      dispose() {},
    };
  },
};

let client: PGlite;
let repo: Repository;
let srv: TestServer;
const bots: Bot[] = [];

beforeAll(async () => {
  client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  repo = createPgRepository(db, async () => {});
  srv = await startTestServer({ repo, games: [soloTest], timing: { startDelayMs: 50 } });
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
  await client.close();
});

async function getBests(token?: string): Promise<{ status: number; body: BestsResponse }> {
  const res = await fetch(`${srv.url}/api/me/bests`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json()) as BestsResponse };
}

describe('repository personal bests', () => {
  it('first score creates a row with plays 1', async () => {
    const g = randomUUID();
    await repo.recordScores([{ guestId: g, gameId: 'snake', mode: 'solo', score: 40 }]);
    expect(await repo.getBests(g)).toEqual([{ gameId: 'snake', mode: 'solo', best: 40, plays: 1 }]);
  });

  it('a lower later score keeps the best and bumps plays', async () => {
    const g = randomUUID();
    await repo.recordScores([{ guestId: g, gameId: 'snake', mode: 'solo', score: 40 }]);
    await repo.recordScores([{ guestId: g, gameId: 'snake', mode: 'solo', score: 10 }]);
    expect(await repo.getBests(g)).toEqual([{ gameId: 'snake', mode: 'solo', best: 40, plays: 2 }]);
  });

  it('a higher score replaces the best', async () => {
    const g = randomUUID();
    await repo.recordScores([{ guestId: g, gameId: 'snake', mode: 'solo', score: 40 }]);
    await repo.recordScores([{ guestId: g, gameId: 'snake', mode: 'solo', score: 75 }]);
    expect(await repo.getBests(g)).toEqual([{ gameId: 'snake', mode: 'solo', best: 75, plays: 2 }]);
  });

  it('solo and party modes are tracked separately', async () => {
    const g = randomUUID();
    await repo.recordScores([
      { guestId: g, gameId: 'snake', mode: 'solo', score: 40 },
      { guestId: g, gameId: 'snake', mode: 'party', score: 5 },
      { guestId: g, gameId: 'pong', mode: 'solo', score: 9 },
    ]);
    expect(await repo.getBests(g)).toEqual([
      { gameId: 'pong', mode: 'solo', best: 9, plays: 1 },
      { gameId: 'snake', mode: 'party', best: 5, plays: 1 },
      { gameId: 'snake', mode: 'solo', best: 40, plays: 1 },
    ]);
  });

  it('recordScores with an empty list is a no-op', async () => {
    await expect(repo.recordScores([])).resolves.toBeUndefined();
  });

  it('skips entries whose guest id is not a uuid and clamps negative scores to 0', async () => {
    const g = randomUUID();
    await expect(
      repo.recordScores([
        { guestId: 'bot-1', gameId: 'snake', mode: 'solo', score: 10 },
        { guestId: g, gameId: 'snake', mode: 'solo', score: -7.4 },
      ]),
    ).resolves.toBeUndefined();
    expect(await repo.getBests(g)).toEqual([{ gameId: 'snake', mode: 'solo', best: 0, plays: 1 }]);
  });
});

describe('GET /api/me/bests', () => {
  it('/api/me/bests requires a token', async () => {
    expect((await getBests()).status).toBe(401);
    const bad = await getBests('not-a-token');
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'unauthorized' });
  });

  it('returns an empty list for a guest with no scores', async () => {
    const g = await getGuest(srv.url);
    expect(await getBests(g.token)).toEqual({ status: 200, body: { bests: [] } });
  });

  it('finishing a solo match records a solo best', async () => {
    const host = await new Bot(srv.url, 'Solo').create();
    bots.push(host);
    host.send('selectGame', { gameId: 'solo-test' });
    await host.until((b) => b.party!.selectedGameId === 'solo-test', 3000, 'game selected');
    host.send('start');
    await host.until((b) => !!b.results, 5000, 'results');

    // recordScores is fire-and-forget on the server; poll until the row shows up.
    let got = await getBests(host.token);
    // Bounded well below the 60/min lookup limit shared with the other requests in this file.
    for (let i = 0; i < 30 && got.body.bests.length === 0; i++) {
      await sleep(100);
      got = await getBests(host.token);
    }
    expect(got.status).toBe(200);
    expect(got.body.bests).toEqual([{ gameId: 'solo-test', mode: 'solo', best: 120, plays: 1 }]);
  });
});

describe('lookup rate limit on /api/me', () => {
  it('/api/me/bests and /api/me/stats share the lookup limiter and 429 before auth', async () => {
    const limited = await startTestServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 30; i++) {
        statuses.push((await fetch(`${limited.url}/api/me/bests`)).status);
        statuses.push((await fetch(`${limited.url}/api/me/stats`)).status);
      }
      expect(statuses.every((s) => s === 401)).toBe(true); // 60 lookups allowed per minute per IP
      const g = await getGuest(limited.url);
      const auth = { headers: { authorization: `Bearer ${g.token}` } };
      const bests = await fetch(`${limited.url}/api/me/bests`, auth);
      expect(bests.status).toBe(429);
      expect(await bests.json()).toEqual({ error: 'rate_limited' });
      expect((await fetch(`${limited.url}/api/me/stats`, auth)).status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe('without a database', () => {
  it('noop repository getBests returns an empty list', async () => {
    expect(await noopRepository.getBests(randomUUID())).toEqual([]);
    const plain = await startTestServer();
    try {
      const g = await getGuest(plain.url);
      const res = await fetch(`${plain.url}/api/me/bests`, { headers: { authorization: `Bearer ${g.token}` } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ bests: [] });
    } finally {
      await plain.close();
    }
  });
});
