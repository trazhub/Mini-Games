import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectPostgres } from '../src/db/connect';
import type { Repository } from '../src/db/repository';

/**
 * Exercises the PRODUCTION driver path (node-postgres + drizzle migrator) against a real
 * PostgreSQL server started by the `embedded-postgres` dev dependency. If the binary is not
 * available on this platform the suite is skipped (and reported as skipped, not passed).
 */
let pgInstance: { start(): Promise<void>; stop(): Promise<void>; createDatabase(n: string): Promise<void>; initialise(): Promise<void> } | null = null;
let dir = '';
let repo: Repository | null = null;
const PORT = 54329;
let available = true;

beforeAll(async () => {
  try {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    dir = mkdtempSync(path.join(tmpdir(), 'mgh-pg-'));
    pgInstance = new EmbeddedPostgres({ databaseDir: dir, user: 'mgh', password: 'mgh-test-pass', port: PORT, persistent: false });
    await pgInstance.initialise();
    await pgInstance.start();
    await pgInstance.createDatabase('minigamehub');
    repo = await connectPostgres(`postgres://mgh:mgh-test-pass@127.0.0.1:${PORT}/minigamehub`);
  } catch (e) {
    available = false;
    console.warn('[pg-driver] embedded postgres unavailable, skipping:', (e as Error).message);
  }
}, 120_000);

afterAll(async () => {
  await repo?.close();
  await pgInstance?.stop().catch(() => {});
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('node-postgres driver against a real PostgreSQL server', () => {
  it('runs the SQL migrations and answers a ping', async (ctx) => {
    if (!available) return ctx.skip();
    expect(await repo!.ping()).toBe(true);
  });

  it('persists a match + stats and survives a repeat migration run (idempotent)', async (ctx) => {
    if (!available) return ctx.skip();
    const g = crypto.randomUUID();
    await repo!.upsertGuest(g);
    await repo!.recordMatch({
      matchId: crypto.randomUUID(),
      partyCode: 'ABCDE',
      gameId: 'orbit-swap',
      startedAt: Date.now() - 1000,
      endedAt: Date.now(),
      // two participants: a win needs an opponent (solo matches never count as wins)
      participants: [
        { guestId: g, nickname: 'Pg', avatar: 'fox', score: 120, rank: 1, partyPoints: 3 },
        { guestId: crypto.randomUUID(), nickname: 'Rival', avatar: 'gem', score: 80, rank: 2, partyPoints: 2 },
      ],
    });
    expect(await repo!.getStats(g)).toEqual({ gamesPlayed: 1, wins: 1, totalScore: 120 });
    const again = await connectPostgres(`postgres://mgh:mgh-test-pass@127.0.0.1:${PORT}/minigamehub`); // re-migrate
    expect(await again.getStats(g)).toEqual({ gamesPlayed: 1, wins: 1, totalScore: 120 });
    await again.close();
  });
});
