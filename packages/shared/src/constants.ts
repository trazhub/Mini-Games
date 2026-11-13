export const APP_NAME = 'MiniGameHub';

export const LIMITS = {
  NICK_MIN: 2,
  NICK_MAX: 16,
  /** Hard cap on party size; individual games may set a lower maximum. */
  PARTY_MAX_PLAYERS: 12,
  ROOM_CODE_LENGTH: 5,
  /** Max size in bytes of a single client message (enforced by the ws transport). */
  MAX_MESSAGE_BYTES: 2048,
} as const;

/** Avatar ids. Rendering (SVG) lives in the web app; the server only validates ids. */
export const AVATAR_IDS = [
  'comet',
  'sprout',
  'pixel',
  'moon',
  'bolt',
  'blob',
  'ghost',
  'star',
  'crown',
  'fox',
  'robot',
  'gem',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export const GAME_CATEGORIES = [
  'party',
  'social',
  'arcade',
  'puzzle',
  'coop',
  'reaction',
  'memory',
] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  party: 'Party',
  social: 'Social',
  arcade: 'Arcade',
  puzzle: 'Puzzle',
  coop: 'Co-op',
  reaction: 'Reaction',
  memory: 'Memory',
};

/** How a game is played: together (party), arcade (solo score chase, replay-verified), action (realtime). */
export const GAME_KINDS = ['together', 'arcade', 'action'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const KIND_LABELS: Record<GameKind, string> = {
  together: 'Together',
  arcade: 'Arcade',
  action: 'Action',
};

/** Limits for arcade score submission (input logs sent as base64url chunks). */
export const ARCADE = {
  MAX_CHUNKS: 16,
  CHUNK_CHARS: 1400,
  MAX_LOG_BYTES: 12000,
  MAX_EVENTS_PER_SEC: 15,
  SUBMIT_GRACE_MS: 5000,
} as const;

/** Alphabet without look-alike characters (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const PARTY_ROOM_NAME = 'party';

/** Colyseus application close codes (4011-4999 are free for apps). */
export const CLOSE_CODES = {
  KICKED: 4401,
  DUPLICATE_SESSION: 4402,
  RATE_LIMITED: 4429,
  PARTY_CLOSED: 4410,
} as const;
