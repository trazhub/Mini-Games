import type { GuestResponse, RecoveryResponse, RoomInfoResponse } from '@minigamehub/shared';
import { API_URL } from './config';
import { claimPrimaryTab, clearStoredSession, getStoredSession, storeSession, type StoredSession } from './identity';

export type { StoredSession } from './identity';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, res.status === 429 ? 'Too many requests - wait a moment and try again.' : 'Request failed');
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const unreachable = () => new ApiError(0, 'Cannot reach the game server. Check your connection and try again.');

/** A session is reused as-is while it has at least this long left... */
const REUSE_MIN_MS = 5 * 60_000;
/** ...and a session with less than this left is renewed (sliding expiry), but at most this often. */
const RENEW_BELOW_MS = 30 * 24 * 3600_000;
const RENEW_EVERY_MS = 6 * 3600_000;

/**
 * Returns a valid guest session. A stored session is reused (and quietly renewed when it is getting
 * old, keeping the same guest id); otherwise a fresh guest is requested. `force` discards the stored
 * session first (the server rejected it).
 */
export async function ensureSession(force = false): Promise<StoredSession> {
  const primary = await claimPrimaryTab();
  const existing = getStoredSession(primary);
  const now = Date.now();
  const left = existing ? existing.expiresAt - now : 0;
  const renewDue = !!existing && left < RENEW_BELOW_MS && now - (existing.checkedAt ?? 0) > RENEW_EVERY_MS;
  if (!force && existing && left > REUSE_MIN_MS && !renewDue) return existing;
  if (force) clearStoredSession(primary);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // Present the old token so the server keeps the same guest (200) instead of minting a new one (201).
  // An invalid/expired token silently falls back to a new guest server-side.
  if (!force && existing) headers.authorization = `Bearer ${existing.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/guest`, { method: 'POST', headers, body: '{}' });
  } catch {
    if (!force && existing && left > REUSE_MIN_MS) return existing; // offline while renewing: the old token still works
    throw unreachable();
  }
  if (!res.ok && !force && existing && left > REUSE_MIN_MS && res.status !== 429) return existing;
  const body = await json<GuestResponse>(res);
  const session: StoredSession = { ...body, checkedAt: Date.now() };
  storeSession(primary, session);
  return session;
}

/** Ask the server for a recovery code for this guest (replaces any earlier one). Shown once; save it. */
export async function createRecoveryCode(token: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/guest/recovery`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {
    throw unreachable();
  });
  const body = await json<RecoveryResponse>(res);
  return body.code;
}

/** Become the guest that owns `code` in this browser. Throws `ApiError` (404 = unknown code, 501 = unsupported). */
export async function restoreGuest(code: string): Promise<StoredSession> {
  const res = await fetch(`${API_URL}/api/guest/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => {
    throw unreachable();
  });
  const body = await json<GuestResponse>(res);
  const session: StoredSession = { ...body, checkedAt: Date.now() };
  storeSession(await claimPrimaryTab(), session);
  return session;
}

export async function fetchRoomInfo(code: string): Promise<RoomInfoResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return (await res.json()) as RoomInfoResponse;
  } catch {
    return null;
  }
}

export async function fetchMyStats(token: string): Promise<{ persisted: boolean; stats: { gamesPlayed: number; wins: number; totalScore: number } | null } | null> {
  try {
    const res = await fetch(`${API_URL}/api/me/stats`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as never;
  } catch {
    return null;
  }
}
