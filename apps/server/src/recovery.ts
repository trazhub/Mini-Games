import { createHmac, randomBytes } from 'node:crypto';

/**
 * Recovery codes restore a guest identity on another device. A code is a bearer secret:
 * whoever holds it can become that guest. Only an HMAC of it is stored (see docs/SECURITY.md).
 *
 * Format: 16 symbols of Crockford base32 (no I, L, O, U), 80 bits from the CSPRNG, shown as
 * `XXXX-XXXX-XXXX-XXXX`. Look-alike letters are rejected rather than mapped, so a typo is
 * reported instead of silently matching a different code.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 16;
const COMPACT_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
/** Domain-separation label: the recovery HMAC key is derived from, never equal to, SESSION_SECRET. */
const KEY_LABEL = 'minigamehub/recovery-code/v1';

function group(compact: string): string {
  return compact.match(/.{4}/g)!.join('-');
}

export function generateRecoveryCode(): string {
  const bytes = randomBytes(10); // 80 bits = 16 x 5-bit symbols, no modulo bias
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return group(out);
}

/** Canonical `XXXX-XXXX-XXXX-XXXX` form, or null for anything that is not exactly a valid code. */
export function normalizeRecoveryCode(input: string): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  if (compact.length !== CODE_LEN || !COMPACT_RE.test(compact)) return null;
  return group(compact);
}

function recoveryKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(KEY_LABEL).digest();
}

/**
 * HMAC-SHA256 (hex) of the canonical code under a key derived from `secret`. Throws on an invalid
 * code; callers normalise first. The DB lookup is by this hash through a unique index, so the
 * plaintext is never compared and an index-timing side channel reveals nothing usable without the key.
 */
export function hashRecoveryCode(code: string, secret: string): string {
  const canonical = normalizeRecoveryCode(code);
  if (!canonical) throw new Error('invalid recovery code');
  return createHmac('sha256', recoveryKey(secret)).update(canonical.replace(/-/g, '')).digest('hex');
}
