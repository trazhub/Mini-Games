/**
 * Durable guest identity: which storage holds this tab's session.
 *
 * Several tabs of one browser are still several players (the server refuses the same guest in a
 * party twice), so only ONE tab - the "primary" tab - keeps its session in `localStorage`, where it
 * survives closing the browser. Every other tab keeps its session in `sessionStorage` (per tab, gone
 * when the tab closes), exactly like before durable identity existed.
 *
 * The primary tab is whichever tab holds the Web Lock `mgh-primary`. The lock is held for the life of
 * the page and released by the browser when the tab closes or crashes, so the next tab to start
 * becomes primary. Without `navigator.locks` every tab is non-primary (the old behaviour).
 */

export interface StoredSession {
  guestId: string;
  token: string;
  /** Epoch ms at which the token expires. */
  expiresAt: number;
  /** Epoch ms of the last successful refresh/issue (so a stale token is renewed at most every few hours). */
  checkedAt?: number;
}

export const PRIMARY_LOCK = 'mgh-primary';
const SESSION_KEY = 'mgh.session';

interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void> | undefined): Promise<unknown>;
}

let primary: Promise<boolean> | null = null;

/**
 * Tries to become the primary tab. Resolves `true` when this tab now holds the lock (for as long as
 * the page lives), `false` when another tab holds it or Web Locks are unavailable. Cached: asking
 * twice returns the same answer.
 */
export function claimPrimaryTab(): Promise<boolean> {
  primary ??= new Promise<boolean>((resolve) => {
    let locks: LockManagerLike | undefined;
    try {
      locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
    } catch {
      locks = undefined;
    }
    if (!locks || typeof locks.request !== 'function') return resolve(false);
    try {
      locks
        .request(PRIMARY_LOCK, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>(() => {}); // never settles: hold the lock until the tab goes away
        })
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
  return primary;
}

/** Forget the cached answer (tests only). */
export function resetPrimaryTabForTests(): void {
  primary = null;
}

/** localStorage/sessionStorage can be missing or throw (private mode, blocked): never let that break identity. */
function store(isPrimary: boolean): Storage | undefined {
  try {
    return isPrimary ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function isSession(v: unknown): v is StoredSession {
  const s = v as Partial<StoredSession> | null;
  return !!s && typeof s.guestId === 'string' && typeof s.token === 'string' && typeof s.expiresAt === 'number';
}

export function getStoredSession(isPrimary: boolean): StoredSession | null {
  try {
    const raw = store(isPrimary)?.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeSession(isPrimary: boolean, session: StoredSession): void {
  try {
    store(isPrimary)?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore: the session still works for this page load */
  }
}

export function clearStoredSession(isPrimary: boolean): void {
  try {
    store(isPrimary)?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
