import { bigint, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Guests are server-issued random ids. We deliberately store no nickname, IP or user agent here:
 * nicknames only live in match history rows (needed to render results) and can be pruned.
 * `account_id` is a nullable hook for future optional accounts (registration is never mandatory).
 */
export const guests = pgTable('guests', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  /** HMAC-SHA256 (hex) of the guest's current recovery code; null until one is requested. Never the code itself. */
  recoveryHash: text('recovery_hash').unique('guests_recovery_hash_unique'),
});

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey(),
    partyCode: text('party_code').notNull(),
    gameId: text('game_id').notNull(),
    playerCount: integer('player_count').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    summary: jsonb('summary'),
  },
  (t) => [index('matches_ended_at_idx').on(t.endedAt), index('matches_game_idx').on(t.gameId)],
);

export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    guestId: uuid('guest_id').notNull(),
    nickname: text('nickname').notNull(),
    avatar: text('avatar').notNull(),
    score: integer('score').notNull(),
    rank: integer('rank').notNull(),
    partyPoints: integer('party_points').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.guestId] }), index('match_participants_guest_idx').on(t.guestId)],
);

export const playerStats = pgTable('player_stats', {
  guestId: uuid('guest_id').primaryKey(),
  gamesPlayed: integer('games_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  totalScore: bigint('total_score', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Personal best per guest, game and mode ('solo' | 'party' | 'daily'; kept as plain text so new
 * modes never need a migration, the union is enforced in TypeScript). `plays` counts every recorded
 * score, not only improvements.
 */
export const gameScores = pgTable(
  'game_scores',
  {
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    mode: text('mode').notNull(),
    best: integer('best').notNull(),
    plays: integer('plays').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guestId, t.gameId, t.mode] })],
);
