import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgRepository, type Repository } from '../src/db/repository';
import { Bot, makeParty, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

let client: PGlite;
let db: ReturnType<typeof drizzle>;
let repo: Repository;
let srv: TestServer;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  repo = createPgRepository(db, async () => {});
  srv = await startTestServer({
    repo,
    gameConfig: { 'majority-trap': { rounds: 1, introMs: 50, answerMs: 400, revealMs: 100, latencyGraceMs: 50 } },
    timing: { startDelayMs: 50 },
  });
});
afterAll(async () => {
  await srv.close();
  await client.close();
});

describe('database (PostgreSQL engine via PGlite)', () => {
  it('applies the generated migration and creates the expected tables', async () => {
    const res = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    const names = (res.rows as { table_name: string }[]).map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['guests', 'match_participants', 'matches', 'player_stats']));
  });

  it('stores no nickname/IP on guest rows (data minimisation)', async () => {
    const res = await db.execute(sql`select column_name from information_schema.columns where table_name = 'guests' order by 1`);
    const cols = (res.rows as { column_name: string }[]).map((r) => r.column_name);
    // recovery_hash is an HMAC of the optional recovery code, not personal data.
    expect(cols).toEqual(['account_id', 'created_at', 'id', 'last_seen_at', 'recovery_hash']);
  });

  it('records a match transactionally and aggregates stats across matches', async () => {
    const g1 = crypto.randomUUID();
    const g2 = crypto.randomUUID();
    const mk = (matchId: string, a: number, b: number) => ({
      matchId,
      partyCode: 'ABCDE',
      gameId: 'majority-trap',
      startedAt: Date.now() - 5000,
      endedAt: Date.now(),
      summary: { rounds: 2 },
      participants: [
        { guestId: g1, nickname: 'One', avatar: 'fox', score: a, rank: a >= b ? 1 : 2, partyPoints: 2 },
        { guestId: g2, nickname: 'Two', avatar: 'gem', score: b, rank: b > a ? 1 : 2, partyPoints: 1 },
      ],
    });
    await repo.recordMatch(mk(crypto.randomUUID(), 300, 100));
    await repo.recordMatch(mk(crypto.randomUUID(), 50, 200));
    expect(await repo.getStats(g1)).toEqual({ gamesPlayed: 2, wins: 1, totalScore: 350 });
    expect(await repo.getStats(g2)).toEqual({ gamesPlayed: 2, wins: 1, totalScore: 300 });
    expect(await repo.getStats(crypto.randomUUID())).toBeNull();
  });

  it('rolls back a failed match insert (no partial rows)', async () => {
    const id = crypto.randomUUID();
    const g = crypto.randomUUID();
    const dup = { guestId: g, nickname: 'Dup', avatar: 'fox', score: 1, rank: 1, partyPoints: 1 };
    await expect(
      repo.recordMatch({ matchId: id, partyCode: 'ZZZZZ', gameId: 'x', startedAt: 1, endedAt: 2, participants: [dup, dup] }),
    ).rejects.toThrow();
    const res = await db.execute(sql`select count(*)::int as n from matches where id = ${id}`);
    expect((res.rows[0] as { n: number }).n).toBe(0);
  });

  it('upserts guests idempotently and answers a liveness ping', async () => {
    const id = crypto.randomUUID();
    await repo.upsertGuest(id);
    await repo.upsertGuest(id);
    const res = await db.execute(sql`select count(*)::int as n from guests where id = ${id}`);
    expect((res.rows[0] as { n: number }).n).toBe(1);
    expect(await repo.ping()).toBe(true);
  });
});

describe('server -> database integration', () => {
  it('persists a finished match and exposes the caller’s own stats', async () => {
    const players = await makeParty(srv.url, 3);
    const host = players[0]!;
    host.send('selectGame', { gameId: 'majority-trap' });
    await host.until((b) => b.party!.selectedGameId === 'majority-trap');
    host.send('start');
    await Promise.all(players.map((p) => p.until((b) => b.gameState?.phase === 'question', 5000, 'question')));
    for (const p of players) p.send('g:action', { type: 'answer', answer: 'A', predict: 'B' });
    await Promise.all(players.map((p) => p.until((b) => !!b.results, 8000, 'results')));
    const matchId = host.results!.matchId;

    // recordMatch is fire-and-forget on the server; poll briefly
    let rows = 0;
    for (let i = 0; i < 40 && rows === 0; i++) {
      const res = await db.execute(sql`select count(*)::int as n from match_participants where match_id = ${matchId}`);
      rows = (res.rows[0] as { n: number }).n;
      if (!rows) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows).toBe(3);

    const stats = await fetch(`${srv.url}/api/me/stats`, { headers: { authorization: `Bearer ${host.token}` } });
    expect(stats.status).toBe(200);
    const body = (await stats.json()) as { persisted: boolean; stats: { gamesPlayed: number } };
    expect(body.persisted).toBe(true);
    expect(body.stats.gamesPlayed).toBe(1);

    const denied = await fetch(`${srv.url}/api/me/stats`, { headers: { authorization: 'Bearer nope' } });
    expect(denied.status).toBe(401);
    await Promise.all(players.map((p) => p.close()));
  });

  it('reports database health on /health', async () => {
    const res = await fetch(`${srv.url}/health`);
    expect(await res.json()).toEqual({ ok: true, db: 'up' });
  });
});

void Bot;
