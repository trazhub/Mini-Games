import type { AvatarId, GameCategory, GameKind } from './constants';

/** Static, client-safe description of a mini-game. */
export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: GameCategory;
  /** How the game is played (party, solo arcade run, or realtime action). */
  kind: GameKind;
  /** Whether the game can be played alone without a party. */
  solo: boolean;
  /** Additional categories shown in filters (e.g. a game can be both party and social). */
  tags: GameCategory[];
  minPlayers: number;
  maxPlayers: number;
  /** Approximate match length in minutes [min, max]. */
  durationMinutes: [number, number];
  controls: { keyboard: string[]; touch: string[] };
  rules: string[];
  mobileFriendly: boolean;
  /** CSS colour used for the card accent. */
  accent: string;
}

export type PartyPhase = 'lobby' | 'starting' | 'playing' | 'results';

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarId;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  /** Participating in the current match (false for spectators who joined mid-game). */
  inGame: boolean;
  /** Party points accumulated across matches. */
  points: number;
  wins: number;
}

export interface MatchRanking {
  playerId: string;
  name: string;
  avatar: AvatarId;
  score: number;
  rank: number;
  /** Party points awarded for this match. */
  partyPoints: number;
}

export interface MatchResults {
  matchId: string;
  gameId: string;
  gameName: string;
  rankings: MatchRanking[];
  winnerIds: string[];
  /** Game specific extra data for the results screen. */
  summary?: Record<string, unknown>;
  endedAt: number;
}

export interface PartyState {
  code: string;
  phase: PartyPhase;
  hostId: string;
  players: PlayerPublic[];
  capacity: number;
  /** Host-selected game for the next match. */
  selectedGameId: string | null;
  /** playerId -> gameId votes (only meaningful in lobby/results). */
  votes: Record<string, string>;
  /** Server time (ms epoch) at which the `starting` phase ends. */
  startsAt: number | null;
  current: { gameId: string; matchId: string } | null;
  lastResults: MatchResults | null;
  matchesPlayed: number;
  serverTime: number;
}

export interface GameStartPayload {
  gameId: string;
  matchId: string;
  config: Record<string, unknown>;
  /** The ids of players participating. Spectators are not included. */
  participantIds: string[];
}

export interface NoticePayload {
  level: 'info' | 'warn' | 'error';
  message: string;
}

/** Messages the server sends. Keyed by message type. */
export interface ServerMessages {
  party: PartyState;
  'game:start': GameStartPayload;
  'game:state': unknown;
  'game:event': { type: string; [k: string]: unknown };
  'game:end': MatchResults;
  pong: { t: number; serverTime: number };
  notice: NoticePayload;
  kicked: { reason: string };
  you: { playerId: string };
}
