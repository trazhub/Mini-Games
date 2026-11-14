import type { BestEntry } from '@minigamehub/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { dailyRuns, gameScores, guests, matchParticipants, matches, playerStats } from './schema';

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

export interface ScoreEntry {
  guestId: string;
  gameId: string;
  mode: BestEntry['mode'];
  score: number;
}

export interface DailyRunEntry {
  day: string;
  gameId: string;
  guestId: string;
  nickname: string;
  avatar: string;
  score: number;
}

export interface DailyTopEntry {
  rank: number;
  nickname: string;
  avatar: string;
  score: number;
}

/** Largest value of a Postgres integer column. */
const MAX_INT = 2147483647;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Repository {
  readonly enabled: boolean;
  upsertGuest(guestId: string): Promise<void>;
  recordMatch(match: MatchRecord): Promise<void>;
  getStats(guestId: string): Promise<PlayerStats | null>;
  /**
   * Upserts personal bests: `best = greatest(existing, score)`, `plays + 1`. Entries whose guestId is
   * not a UUID (bots, test players) are skipped. Scores are stored as
   * `min(2147483647, max(0, round(score)))` (clamped to the int4 column range).
   */
  recordScores(entries: ScoreEntry[]): Promise<void>;
  /** All bests of a guest, ordered by game id then mode. */
  getBests(guestId: string): Promise<BestEntry[]>;
  /** Stores (replacing any previous) recovery-code hash for the guest, creating the row if needed. */
  setRecoveryHash(guestId: string, hash: string): Promise<void>;
  /** Guest id owning this recovery-code hash, or null. */
  findGuestByRecoveryHash(hash: string): Promise<string | null>;
  /** Whether the guest already has a daily run for this UTC day and game. */
  hasDailyRun(day: string, gameId: string, guestId: string): Promise<boolean>;
  /**
   * Stores a daily run. One run per (day, game, guest): a later insert for the same key is ignored (the
   * first run is kept, nothing throws). Non-UUID guest ids are skipped; the score is stored as
   * `min(2147483647, max(0, round(score)))`.
   */
  recordDailyRun(entry: DailyRunEntry): Promise<void>;
  /** Raises (never lowers) the score of an existing daily run; created_at (the tie-break) is untouched. */
  updateDailyRunScore(day: string, gameId: string, guestId: string, score: number): Promise<void>;
  /** Top runs of a day and game by score (desc), earliest run first on ties; ranks are 1..n by position. */
  dailyTop(day: string, gameId: string, limit: number): Promise<DailyTopEntry[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** Used when no database is configured: the platform keeps working, only stats are not persisted. */
export const noopRepository: Repository = {
  enabled: false,
  upsertGuest: async () => {},
  recordMatch: async () => {},
  getStats: async () => null,
  recordScores: async () => {},
  getBests: async () => [],
  setRecoveryHash: async () => {},
  findGuestByRecoveryHash: async () => null,
  hasDailyRun: async () => false,
  recordDailyRun: async () => {},
  updateDailyRunScore: async () => {},
  dailyTop: async () => [],
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
          // A win needs an opponent: a solo match is rank 1 but never a win (same rule as the
          // live party `wins` counter in PartyRoom.completeMatch).
          const win = m.participants.length > 1 && p.rank === 1 ? 1 : 0;
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
            .values({ guestId: p.guestId, gamesPlayed: 1, wins: win, totalScore: p.score })
            .onConflictDoUpdate({
              target: playerStats.guestId,
              set: {
                gamesPlayed: sql`${playerStats.gamesPlayed} + 1`,
                wins: sql`${playerStats.wins} + ${win}`,
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
    async recordScores(entries) {
      // `best` is an integer shown to players, so fractional scores are rounded and negatives clamped to 0.
      const valid = entries
        .filter((e) => UUID_RE.test(e.guestId) && Number.isFinite(e.score))
        .map((e) => ({ ...e, score: Math.min(MAX_INT, Math.max(0, Math.round(e.score))) }));
      if (valid.length === 0) return;
      await db.transaction(async (tx) => {
        for (const e of valid) {
          await tx.insert(guests).values({ id: e.guestId }).onConflictDoNothing();
          await tx
            .insert(gameScores)
            .values({ guestId: e.guestId, gameId: e.gameId, mode: e.mode, best: e.score, plays: 1 })
            .onConflictDoUpdate({
              target: [gameScores.guestId, gameScores.gameId, gameScores.mode],
              set: {
                best: sql`greatest(${gameScores.best}, ${e.score})`,
                plays: sql`${gameScores.plays} + 1`,
                updatedAt: sql`now()`,
              },
            });
        }
      });
    },
    async getBests(guestId) {
      const rows = await db
        .select({ gameId: gameScores.gameId, mode: gameScores.mode, best: gameScores.best, plays: gameScores.plays })
        .from(gameScores)
        .where(eq(gameScores.guestId, guestId))
        .orderBy(asc(gameScores.gameId), asc(gameScores.mode));
      return rows.map((r) => ({ gameId: r.gameId, mode: r.mode as BestEntry['mode'], best: r.best, plays: r.plays }));
    },
    async setRecoveryHash(guestId, hash) {
      await db
        .insert(guests)
        .values({ id: guestId, recoveryHash: hash })
        .onConflictDoUpdate({ target: guests.id, set: { recoveryHash: hash, lastSeenAt: sql`now()` } });
    },
    async findGuestByRecoveryHash(hash) {
      const rows = await db.select({ id: guests.id }).from(guests).where(eq(guests.recoveryHash, hash)).limit(1);
      return rows[0]?.id ?? null;
    },
    async hasDailyRun(day, gameId, guestId) {
      if (!UUID_RE.test(guestId)) return false;
      const rows = await db
        .select({ day: dailyRuns.day })
        .from(dailyRuns)
        .where(and(eq(dailyRuns.day, day), eq(dailyRuns.gameId, gameId), eq(dailyRuns.guestId, guestId)))
        .limit(1);
      return rows.length > 0;
    },
    async recordDailyRun(e) {
      if (!UUID_RE.test(e.guestId) || !Number.isFinite(e.score)) return;
      const score = Math.min(MAX_INT, Math.max(0, Math.round(e.score)));
      await db.transaction(async (tx) => {
        await tx.insert(guests).values({ id: e.guestId }).onConflictDoNothing();
        await tx
          .insert(dailyRuns)
          .values({ day: e.day, gameId: e.gameId, guestId: e.guestId, nickname: e.nickname, avatar: e.avatar, score })
          .onConflictDoNothing();
      });
    },
    async updateDailyRunScore(day, gameId, guestId, score) {
      if (!UUID_RE.test(guestId) || !Number.isFinite(score)) return;
      const clamped = Math.min(MAX_INT, Math.max(0, Math.round(score)));
      await db
        .update(dailyRuns)
        .set({ score: sql`greatest(${dailyRuns.score}, ${clamped})` })
        .where(and(eq(dailyRuns.day, day), eq(dailyRuns.gameId, gameId), eq(dailyRuns.guestId, guestId)));
    },
    async dailyTop(day, gameId, limit) {
      const rows = await db
        .select({ nickname: dailyRuns.nickname, avatar: dailyRuns.avatar, score: dailyRuns.score })
        .from(dailyRuns)
        .where(and(eq(dailyRuns.day, day), eq(dailyRuns.gameId, gameId)))
        .orderBy(desc(dailyRuns.score), asc(dailyRuns.createdAt), asc(dailyRuns.guestId))
        .limit(Math.max(0, Math.floor(limit)));
      return rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, avatar: r.avatar, score: r.score }));
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
