import { AVATAR_IDS, LIMITS, ROOM_CODE_ALPHABET, type AvatarId } from './constants';

// Control chars, bidi overrides, zero-width chars and other invisible formatting.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const ANGLE = /[<>]/g;

/**
 * Normalises a user supplied nickname. Returns null if it is unusable.
 * React escapes output anyway; this keeps names tidy and defends other consumers (logs, DB).
 */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(ANGLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.NICK_MAX)
    .trim();
  if (cleaned.length < LIMITS.NICK_MIN) return null;
  return cleaned;
}

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === 'string' && (AVATAR_IDS as readonly string[]).includes(v);
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== LIMITS.ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function generateRoomCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < LIMITS.ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}
