import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { GameInstance, GamePlugin } from '@minigamehub/game-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepository, type Repository } from '../src/db/repository';
import { Bot, makeParty, sleep, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Finishes as soon as it starts, with one score per participant (the first player scores highest). */
const soloTest: GamePlugin = {
  meta: {
    id: 'solo-test',
    name: 'Solo Test',
    tagline: 'Test double',
    description: 'Finishes immediately; used to verify one-player parties.',
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
        ctx.finish({ scores: ctx.players.map((p, i) => ({ playerId: p.id, score: 100 - i * 10 })) });
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
const track = <T extends Bot[]>(list: T): T => (bots.push(...list), list);

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

async function startSolo(host: Bot) {
  host.send('selectGame', { gameId: 'solo-test' });
  await host.until((b) => b.party!.selectedGameId === 'solo-test', 3000, 'game selected');
  host.send('start');
}

/** recordMatch is fire-and-forget on the server; poll until the guest's stats row exists. */
async function statsFor(guestId: string) {
  for (let i = 0; i < 60; i++) {
    const s = await repo.getStats(guestId);
    if (s) return s;
    await sleep(50);
  }
  return null;
}

describe('solo parties (one player, game with minPlayers 1)', () => {
  it('solo party can start and finish', async () => {
    const [host] = track([await new Bot(srv.url, 'Solo').create()]);
    await startSolo(host!);
    await host!.until((b) => !!b.results, 5000, 'results');
    const r = host!.results!;
    expect(r.rankings).toHaveLength(1);
    expect(r.rankings[0]!.rank).toBe(1);
    expect(r.rankings[0]!.partyPoints).toBe(1);
    expect(r.winnerIds).toEqual([host!.playerId]);
    await host!.until((b) => b.party!.phase === 'results', 3000, 'party results phase');
    expect(host!.me()!.points).toBe(1);
    expect(host!.party!.matchesPlayed).toBe(1);
  });

  it('solo match does not count as a win', async () => {
    const [host] = track([await new Bot(srv.url, 'Solo').create()]);
    await startSolo(host!);
    await host!.until((b) => !!b.results && b.party!.phase === 'results', 5000, 'results');
    expect(host!.me()!.wins).toBe(0);
    expect(host!.me()!.points).toBe(1);

    const stats = await statsFor(host!.guestId);
    expect(stats).not.toBeNull();
    expect(stats!.gamesPlayed).toBe(1);
    expect(stats!.wins).toBe(0);
  });

  it('two-player match still awards one win', async () => {
    const players = track(await makeParty(srv.url, 2));
    const host = players[0]!;
    await startSolo(host);
    await Promise.all(players.map((p) => p.until((b) => !!b.results && b.party!.phase === 'results', 5000, 'results')));
    expect(host.results!.rankings).toHaveLength(2);
    const winner = host.results!.rankings.find((r) => r.rank === 1)!;
    const wins = Object.fromEntries(host.party!.players.map((p) => [p.id, p.wins]));
    expect(wins[winner.playerId]).toBe(1);
    expect(Object.values(wins).reduce((a, b) => a + b, 0)).toBe(1);

    const winnerBot = players.find((p) => p.playerId === winner.playerId)!;
    const stats = await statsFor(winnerBot.guestId);
    expect(stats).toMatchObject({ gamesPlayed: 1, wins: 1 });
  });
});
