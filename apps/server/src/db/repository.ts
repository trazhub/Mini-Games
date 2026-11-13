import { eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { guests, matchParticipants, matches, playerStats } from './schema';

export interface MatchRecord {
  matchId: string;
  partyCode: string;
  gameId: string;
  startedAt: number;
  endedAt: number;
  summary?: Record<string, unknown>;
  participants: {
    guestId: string;
    nickname: string;
    avatar: string;
    score: number;
    rank: number;
    partyPoints: number;
  }[];
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  totalScore: number;
}

export interface Repository {
  readonly enabled: boolean;
  upsertGuest(guestId: string): Promise<void>;
  recordMatch(match: MatchRecord): Promise<void>;
  getStats(guestId: string): Promise<PlayerStats | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** Used when no database is configured: the platform keeps working, only stats are not persisted. */
export const noopRepository: Repository = {
  enabled: false,
  upsertGuest: async () => {},
  recordMatch: async () => {},
  getStats: async () => null,
  ping: async () => true,
  close: async () => {},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<PgQueryResultHKT, any>;

export function createPgRepository(db: AnyPgDb, closeFn: () => Promise<void>): Repository {
  return {
    enabled: true,
    async upsertGuest(guestId) {
      await db
        .insert(guests)
        .values({ id: guestId })
        .onConflictDoUpdate({ target: guests.id, set: { lastSeenAt: sql`now()` } });
    },
    async recordMatch(m) {
      await db.transaction(async (tx) => {
        await tx.insert(matches).values({
          id: m.matchId,
          partyCode: m.partyCode,
          gameId: m.gameId,
          playerCount: m.participants.length,
          startedAt: new Date(m.startedAt),
          endedAt: new Date(m.endedAt),
          summary: m.summary ?? null,
        });
        for (const p of m.participants) {
          await tx.insert(guests).values({ id: p.guestId }).onConflictDoNothing();
          await tx.insert(matchParticipants).values({
            matchId: m.matchId,
            guestId: p.guestId,
            nickname: p.nickname,
            avatar: p.avatar,
            score: p.score,
            rank: p.rank,
            partyPoints: p.partyPoints,
          });
          await tx
            .insert(playerStats)
            .values({ guestId: p.guestId, gamesPlayed: 1, wins: p.rank === 1 ? 1 : 0, totalScore: p.score })
            .onConflictDoUpdate({
              target: playerStats.guestId,
              set: {
                gamesPlayed: sql`${playerStats.gamesPlayed} + 1`,
                wins: sql`${playerStats.wins} + ${p.rank === 1 ? 1 : 0}`,
                totalScore: sql`${playerStats.totalScore} + ${p.score}`,
                updatedAt: sql`now()`,
              },
            });
        }
      });
    },
    async getStats(guestId) {
      const rows = await db.select().from(playerStats).where(eq(playerStats.guestId, guestId)).limit(1);
      const r = rows[0];
      return r ? { gamesPlayed: r.gamesPlayed, wins: r.wins, totalScore: r.totalScore } : null;
    },
    async ping() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close: closeFn,
  };
}
