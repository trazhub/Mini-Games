import type { GuestResponse, RoomInfoResponse } from '@minigamehub/shared';
import { API_URL } from './config';
import { clearSession, getStoredSession, storeSession, type StoredSession } from './storage';

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

/** Returns a valid guest session, requesting a fresh one from the server when needed. */
export async function ensureSession(force = false): Promise<StoredSession> {
  const existing = getStoredSession();
  if (!force && existing && existing.expiresAt - Date.now() > 5 * 60_000) return existing;
  if (force) clearSession();
  const res = await fetch(`${API_URL}/api/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => {
    throw new ApiError(0, 'Cannot reach the game server. Check your connection and try again.');
  });
  const body = await json<GuestResponse>(res);
  storeSession(body);
  return body;
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
