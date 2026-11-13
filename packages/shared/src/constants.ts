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
