import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { dailySeed, dayKey, splitChunks } from '@minigamehub/game-core';
import { defaultLaneConfig, laneRunnerSim } from '@minigamehub/game-lane-runner';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepository, noopRepository, type Repository } from '../src/db/repository';
import { Bot, makeParty, sleep, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const DAY_1 = Date.UTC(2026, 10, 14, 12, 0, 0);
const DAY_2 = Date.UTC(2026, 10, 15, 0, 0, 1);

let clock = DAY_1;
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
  srv = await startTestServer({ repo, timing: { startDelayMs: 50 }, now: () => clock });
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
  await client.close();
});

async function select(host: Bot, gameId: string) {
  host.send('selectGame', { gameId });
  await host.until((b) => b.party!.selectedGameId === gameId, 3000, 'game selected');
}

/** The seed announced to the client by the arcade game (arrives with `game:start`). */
async function arcadeSeed(host: Bot): Promise<number> {
  await host.until((b) => b.eventsOf('arcade:start').length > 0, 5000, 'arcade started');
  return host.eventsOf('arcade:start')[0]!.seed as number;
}

/** Submit an input-less run (the server still replays it and keeps its own score). */
async function finishWithEmptyLog(host: Bot) {
  for (const c of splitChunks('')) host.send('arcade:chunk', c);
  await host.until((b) => !!b.results && b.party!.phase === 'results', 5000, 'results');
}

async function waitFor<T>(fn: () => Promise<T | null | false>, label: string): Promise<T> {
  for (let i = 0; i < 80; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const emptyLogScore = (seed: number) => laneRunnerSim.replay(seed, defaultLaneConfig, []).score;

describe('daily start rules', () => {
  it('daily start is refused for a party of 2', async () => {
    clock = DAY_1;
    const players = track(await makeParty(srv.url, 2));
    const host = players[0]!;
    await select(host, 'lane-runner');
    host.send('start', { daily: true });
    await host.until((b) => b.notices.some((n) => /daily/i.test(n)), 3000, 'daily notice');
    await sleep(250);
    expect(host.party!.phase).toBe('lobby');
    expect(host.gameStart).toBeNull();
  });

  it('daily start is refused for a non-arcade game', async () => {
    clock = DAY_1;
    const [host] = track([await new Bot(srv.url, 'Solo').create()]);
    await select(host!, 'echo-steps');
    host!.send('start', { daily: true });
    await host!.until((b) => b.notices.some((n) => /daily/i.test(n)), 3000, 'daily notice');
    await sleep(250);
    expect(host!.party!.phase).toBe('lobby');
    expect(host!.gameStart).toBeNull();
  });

  it('second daily attempt the same day is refused, next day allowed', async () => {
    clock = DAY_1;
    const [host] = track([await new Bot(srv.url, 'Racer', 'comet').create()]);
    await select(host!, 'lane-runner');
    host!.send('start', { daily: true });
    const seed = await arcadeSeed(host!);
    expect(seed).toBe(dailySeed('lane-runner', '2026-11-14'));
    await finishWithEmptyLog(host!);

    const expected = emptyLogScore(seed);
    const top = await waitFor(async () => {
      const t = await repo.dailyTop('2026-11-14', 'lane-runner', 10);
      return t[0]?.score === expected ? t : null;
    }, 'daily score raised');
    expect(top).toEqual([{ rank: 1, nickname: 'Racer', avatar: 'comet', score: expected }]);
    // The score also lands in the personal bests under the 'daily' mode, never 'solo'.
    const bests = await waitFor(async () => {
      const b = await repo.getBests(host!.guestId);
      return b.length > 0 ? b : null;
    }, 'bests');
    expect(bests).toEqual([{ gameId: 'lane-runner', mode: 'daily', best: expected, plays: 1 }]);

    // Same UTC day: refused, nothing starts.
    const before = host!.notices.length;
    host!.send('start', { daily: true });
    await host!.until((b) => b.notices.length > before, 3000, 'repeat notice');
    expect(host!.notices.at(-1)).toMatch(/already played/i);
    await sleep(250);
    expect(host!.party!.phase).toBe('results');

    // After 00:00 UTC the next challenge is open, with a different seed.
    clock = DAY_2;
    host!.events = [];
    host!.send('start', { daily: true });
    await host!.until((b) => b.party!.phase === 'starting' || b.party!.phase === 'playing', 3000, 'second day starts');
    await host!.until((b) => b.eventsOf('arcade:start').length > 0, 5000, 'second day arcade start');
    expect(host!.eventsOf('arcade:start')[0]!.seed).toBe(dailySeed('lane-runner', '2026-11-15'));
  });

  it('finishing after midnight UTC still scores for the start day', async () => {
    clock = Date.UTC(2026, 11, 24, 23, 59, 0);
    const [host] = track([await new Bot(srv.url, 'Night').create()]);
    await select(host!, 'lane-runner');
    host!.send('start', { daily: true });
    const seed = await arcadeSeed(host!);
    expect(seed).toBe(dailySeed('lane-runner', '2026-12-24'));
    // The attempt is consumed at start: the 0-score row exists before any submission.
    await waitFor(() => repo.hasDailyRun('2026-12-24', 'lane-runner', host!.guestId), 'run on the start day');
    clock = Date.UTC(2026, 11, 25, 0, 0, 30);
    await finishWithEmptyLog(host!);
    const expected = emptyLogScore(seed);
    expect(expected).toBeGreaterThan(0);
    await waitFor(async () => (await repo.dailyTop('2026-12-24', 'lane-runner', 10))[0]?.score === expected, 'score on the start day');
    expect(await repo.hasDailyRun('2026-12-25', 'lane-runner', host!.guestId)).toBe(false);
    expect(await repo.dailyTop('2026-12-25', 'lane-runner', 10)).toEqual([]);
  });

  it('leaving a daily match early still consumes the attempt', async () => {
    clock = Date.UTC(2027, 5, 6, 10);
    const [host] = track([await new Bot(srv.url, 'Quitter').create()]);
    await select(host!, 'lane-runner');
    host!.send('start', { daily: true });
    await arcadeSeed(host!);
    expect(await repo.dailyTop('2027-06-06', 'lane-runner', 10)).toEqual([{ rank: 1, nickname: 'Quitter', avatar: 'comet', score: 0 }]);

    // Back to the lobby (abort) and retry in the same party: refused.
    host!.send('backToLobby');
    await host!.until((b) => b.party!.phase === 'lobby', 3000, 'lobby');
    const before = host!.notices.length;
    host!.send('start', { daily: true });
    await host!.until((b) => b.notices.length > before, 3000, 'repeat notice');
    expect(host!.notices.at(-1)).toMatch(/already played/i);
    await sleep(250);
    expect(host!.party!.phase).toBe('lobby');

    // Leaving entirely and retrying from a fresh party with the same guest: refused too.
    await host!.close();
    const again = new Bot(srv.url, 'Quitter');
    again.token = host!.token;
    again.guestId = host!.guestId;
    track([await again.create()]);
    await select(again, 'lane-runner');
    again.send('start', { daily: true });
    await again.until((b) => b.notices.some((n) => /already played/i.test(n)), 3000, 'repeat notice in new party');
    expect(again.party!.phase).toBe('lobby');
    expect((await repo.dailyTop('2027-06-06', 'lane-runner', 10))[0]!.score).toBe(0);
  });

  it('daily start is refused when a disconnected second member is in the party', async () => {
    clock = DAY_1;
    const players = track(await makeParty(srv.url, 2));
    const [host, guest] = players as [Bot, Bot];
    guest.drop();
    await host.until((b) => b.party!.players.some((p) => !p.connected), 3000, 'second member disconnected');
    expect(host.party!.players).toHaveLength(2);
    await select(host, 'lane-runner');
    host.send('start', { daily: true });
    await host.until((b) => b.notices.some((n) => /daily/i.test(n)), 3000, 'daily notice');
    await sleep(250);
    expect(host.party!.phase).toBe('lobby');
    expect(await repo.hasDailyRun('2026-11-14', 'lane-runner', host.guestId)).toBe(false);
  });

  it('two guests get the same seed on the same day', async () => {
    clock = DAY_1;
    const [a, b] = track([await new Bot(srv.url, 'Alice').create(), await new Bot(srv.url, 'Bob').create()]);
    await select(a!, 'lane-runner');
    await select(b!, 'lane-runner');
    a!.send('start', { daily: true });
    b!.send('start', { daily: true });
    const [seedA, seedB] = await Promise.all([arcadeSeed(a!), arcadeSeed(b!)]);
    expect(seedA).toBe(seedB);
    expect(seedA).toBe(dailySeed('lane-runner', dayKey(DAY_1)));
  });

  it('a daily start with { } or undefined behaves like a normal start', async () => {
    clock = Date.UTC(2032, 2, 3, 9);
    const [a, b] = track([await new Bot(srv.url, 'Plain1').create(), await new Bot(srv.url, 'Plain2').create()]);
    for (const [bot, payload] of [
      [a!, {}],
      [b!, undefined],
    ] as const) {
      await select(bot, 'lane-runner');
      if (payload === undefined) bot.send('start');
      else bot.send('start', payload);
      const seed = await arcadeSeed(bot);
      expect(seed).not.toBe(dailySeed('lane-runner', '2032-03-03'));
      expect(bot.notices).toEqual([]);
      await finishWithEmptyLog(bot);
    }
    const bests = await waitFor(async () => {
      const r = await repo.getBests(a!.guestId);
      return r.length > 0 ? r : null;
    }, 'bests');
    expect(bests[0]!.mode).toBe('solo');
    expect(await repo.hasDailyRun('2032-03-03', 'lane-runner', a!.guestId)).toBe(false);
    expect(await repo.dailyTop('2032-03-03', 'lane-runner', 10)).toEqual([]);
  });

  it('rejects a start request with unknown fields as malformed', async () => {
    const [host] = track([await new Bot(srv.url, 'Odd').create()]);
    await select(host!, 'lane-runner');
    const before = srv.app.runtime.metrics.counters.malformed;
    host!.send('start', { daily: true, extra: 1 });
    await sleep(300);
    expect(srv.app.runtime.metrics.counters.malformed).toBe(before + 1);
    expect(host!.party!.phase).toBe('lobby');
  });
});

describe('daily repository', () => {
  it('updateDailyRunScore only raises the score and keeps the run order', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const base = { day: '2040-04-04', gameId: 'lane-runner', avatar: 'comet' };
    await repo.recordDailyRun({ ...base, guestId: a, nickname: 'A', score: 0 });
    await sleep(10);
    await repo.recordDailyRun({ ...base, guestId: b, nickname: 'B', score: 0 });
    await repo.updateDailyRunScore(base.day, base.gameId, b, 50);
    await repo.updateDailyRunScore(base.day, base.gameId, b, 20);
    await repo.updateDailyRunScore(base.day, base.gameId, a, 50);
    await repo.updateDailyRunScore(base.day, base.gameId, randomUUID(), 99); // unknown run: no-op
    // A and B tie on 50: A started first, so A ranks first. B's lower update never lowered it.
    expect((await repo.dailyTop(base.day, base.gameId, 10)).map((e) => [e.nickname, e.score])).toEqual([
      ['A', 50],
      ['B', 50],
    ]);
  });

  it('records, detects and keeps the first run per guest and day', async () => {
    const g = randomUUID();
    expect(await repo.hasDailyRun('2040-01-01', 'lane-runner', g)).toBe(false);
    await repo.recordDailyRun({ day: '2040-01-01', gameId: 'lane-runner', guestId: g, nickname: 'First', avatar: 'comet', score: 10 });
    expect(await repo.hasDailyRun('2040-01-01', 'lane-runner', g)).toBe(true);
    expect(await repo.hasDailyRun('2040-01-02', 'lane-runner', g)).toBe(false);
    expect(await repo.hasDailyRun('2040-01-01', 'other', g)).toBe(false);
    await expect(
      repo.recordDailyRun({ day: '2040-01-01', gameId: 'lane-runner', guestId: g, nickname: 'Second', avatar: 'comet', score: 999 }),
    ).resolves.toBeUndefined();
    expect(await repo.dailyTop('2040-01-01', 'lane-runner', 10)).toEqual([{ rank: 1, nickname: 'First', avatar: 'comet', score: 10 }]);
  });

  it('clamps scores and skips non-uuid guests', async () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    const base = { day: '2040-02-02', gameId: 'lane-runner', avatar: 'comet' };
    await repo.recordDailyRun({ ...base, guestId: a, nickname: 'Huge', score: 1e12 });
    await repo.recordDailyRun({ ...base, guestId: b, nickname: 'Neg', score: -5 });
    await repo.recordDailyRun({ ...base, guestId: c, nickname: 'Frac', score: 41.6 });
    await repo.recordDailyRun({ ...base, guestId: 'bot-1', nickname: 'Bot', score: 5 });
    expect(await repo.hasDailyRun('2040-02-02', 'lane-runner', 'bot-1')).toBe(false);
    expect((await repo.dailyTop('2040-02-02', 'lane-runner', 10)).map((e) => [e.nickname, e.score])).toEqual([
      ['Huge', 2147483647],
      ['Frac', 42],
      ['Neg', 0],
    ]);
  });

  it('ties are broken by earliest run', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const names = ['Early', 'Middle', 'Late'];
    for (const [i, id] of ids.entries()) {
      await repo.recordDailyRun({ day: '2040-03-03', gameId: 'lane-runner', guestId: id, nickname: names[i]!, avatar: 'comet', score: 500 });
      await sleep(10);
    }
    await repo.recordDailyRun({ day: '2040-03-03', gameId: 'lane-runner', guestId: randomUUID(), nickname: 'Better', avatar: 'comet', score: 501 });
    const top = await repo.dailyTop('2040-03-03', 'lane-runner', 10);
    expect(top.map((e) => [e.rank, e.nickname])).toEqual([
      [1, 'Better'],
      [2, 'Early'],
      [3, 'Middle'],
      [4, 'Late'],
    ]);
    expect(await repo.dailyTop('2040-03-03', 'lane-runner', 2)).toHaveLength(2);
  });
});

describe('GET /api/daily/:gameId', () => {
  it('leaderboard orders by score and returns nickname + avatar only', async () => {
    clock = Date.UTC(2041, 4, 5, 8);
    const rows = [
      { nickname: 'Low', avatar: 'comet', score: 5 },
      { nickname: 'High', avatar: 'ember', score: 900 },
      { nickname: 'Mid', avatar: 'comet', score: 70 },
    ];
    for (const r of rows) await repo.recordDailyRun({ day: '2041-05-05', gameId: 'lane-runner', guestId: randomUUID(), ...r });
    const res = await fetch(`${srv.url}/api/daily/lane-runner`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { day: string; entries: Record<string, unknown>[] };
    expect(body.day).toBe('2041-05-05');
    expect(body.entries).toEqual([
      { rank: 1, nickname: 'High', avatar: 'ember', score: 900 },
      { rank: 2, nickname: 'Mid', avatar: 'comet', score: 70 },
      { rank: 3, nickname: 'Low', avatar: 'comet', score: 5 },
    ]);
    for (const e of body.entries) expect(Object.keys(e).sort()).toEqual(['avatar', 'nickname', 'rank', 'score']);
  });

  it('returns an empty board for a day nobody played', async () => {
    clock = Date.UTC(2042, 0, 1);
    const res = await fetch(`${srv.url}/api/daily/lane-runner`);
    expect(await res.json()).toEqual({ day: '2042-01-01', entries: [] });
  });

  it('GET /api/daily rejects unknown game ids with 404', async () => {
    for (const id of ['nope', 'echo-steps', 'x'.repeat(300), '..%2F..%2Fetc']) {
      const res = await fetch(`${srv.url}/api/daily/${id}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'unknown_game' });
    }
  });
});

describe('without a database', () => {
  it('daily start without a database still works but has no repeat protection', async () => {
    const plain = await startTestServer({ repo: noopRepository, timing: { startDelayMs: 50 }, now: () => DAY_1 });
    try {
      const [host] = track([await new Bot(plain.url, 'NoDb').create()]);
      await select(host!, 'lane-runner');
      for (let round = 0; round < 2; round++) {
        host!.events = [];
        host!.send('start', { daily: true });
        const seed = await arcadeSeed(host!);
        expect(seed).toBe(dailySeed('lane-runner', '2026-11-14'));
        await finishWithEmptyLog(host!);
        expect(host!.notices).toEqual([]);
        host!.results = null;
      }
      const res = await fetch(`${plain.url}/api/daily/lane-runner`);
      expect(await res.json()).toEqual({ day: '2026-11-14', entries: [] });
    } finally {
      await Promise.all(bots.splice(0).map((b) => b.close()));
      await plain.close();
    }
  });
});
