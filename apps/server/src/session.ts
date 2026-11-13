import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface SessionClaims {
  /** Guest id (uuid). The ONLY identity the server ever authorises against. */
  sub: string;
  exp: number;
  iat: number;
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueGuestSession(
  secret: string,
  ttlMs: number,
  now = Date.now(),
  guestId: string = randomUUID(),
): { guestId: string; token: string; expiresAt: number } {
  const claims: SessionClaims = { sub: guestId, iat: now, exp: now + ttlMs };
  const body = b64u(JSON.stringify(claims));
  return { guestId, token: `${body}.${sign(secret, body)}`, expiresAt: claims.exp };
}

/** Returns the claims for a valid, unexpired token; otherwise null. Constant-time signature check. */
export function verifySession(secret: string, token: unknown, now = Date.now()): SessionClaims | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
