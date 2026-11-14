import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny in-memory Storage. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

/** One browser: a lock table shared by every "tab" (module instance) plus one localStorage. */
function fakeBrowser() {
  const held = new Set<string>();
  const locks = {
    request: (name: string, _o: unknown, cb: (lock: unknown) => Promise<void> | undefined) => {
      if (held.has(name)) return Promise.resolve(cb(null));
      held.add(name);
      return Promise.resolve(cb({ name }));
    },
  };
  return { locks, localStorage: memoryStorage() };
}

/** Load a fresh copy of identity.ts, i.e. a new tab of that browser. */
async function openTab(browser: ReturnType<typeof fakeBrowser> | null, opts: { locks?: boolean } = {}) {
  vi.resetModules();
  vi.stubGlobal('navigator', browser && opts.locks !== false ? { locks: browser.locks } : {});
  vi.stubGlobal('localStorage', browser?.localStorage ?? memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  return import('./identity');
}

const session = { guestId: 'g1', token: 't1', expiresAt: Date.now() + 1e9 };

describe('identity', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('first tab becomes primary and persists to localStorage', async () => {
    const b = fakeBrowser();
    const tab = await openTab(b);
    expect(await tab.claimPrimaryTab()).toBe(true);
    tab.storeSession(true, session);
    expect(tab.getStoredSession(true)).toEqual(session);
    expect(b.localStorage.getItem('mgh.session')).toContain('"t1"');
    expect(globalThis.sessionStorage.getItem('mgh.session')).toBeNull();
  });

  it('second tab is not primary and uses sessionStorage', async () => {
    const b = fakeBrowser();
    const first = await openTab(b);
    expect(await first.claimPrimaryTab()).toBe(true);
    first.storeSession(true, session);

    const second = await openTab(b);
    expect(await second.claimPrimaryTab()).toBe(false);
    // The second tab must NOT adopt the primary tab's guest (that would be one guest in two tabs).
    expect(second.getStoredSession(false)).toBeNull();
    second.storeSession(false, { ...session, guestId: 'g2', token: 't2' });
    expect(second.getStoredSession(false)?.guestId).toBe('g2');
    expect(JSON.parse(b.localStorage.getItem('mgh.session')!).guestId).toBe('g1');
  });

  it('asking twice returns the same answer', async () => {
    const tab = await openTab(fakeBrowser());
    expect(await tab.claimPrimaryTab()).toBe(true);
    expect(await tab.claimPrimaryTab()).toBe(true);
  });

  it('without navigator.locks every tab is non-primary (today\'s behavior)', async () => {
    const b = fakeBrowser();
    const a = await openTab(b, { locks: false });
    const c = await openTab(b, { locks: false });
    expect(await a.claimPrimaryTab()).toBe(false);
    expect(await c.claimPrimaryTab()).toBe(false);
  });

  it('a lock request that rejects is treated as non-primary', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('SecurityError')) } });
    const tab = await import('./identity');
    expect(await tab.claimPrimaryTab()).toBe(false);
  });

  it('storage that throws never crashes identity', async () => {
    vi.resetModules();
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', boom);
    vi.stubGlobal('sessionStorage', boom);
    const tab = await import('./identity');
    expect(tab.getStoredSession(true)).toBeNull();
    expect(tab.getStoredSession(false)).toBeNull();
    expect(() => tab.storeSession(true, session)).not.toThrow();
    expect(() => tab.clearStoredSession(false)).not.toThrow();
  });

  it('ignores a stored value that is not a session', async () => {
    const b = fakeBrowser();
    b.localStorage.setItem('mgh.session', '{"guestId":1}');
    const tab = await openTab(b);
    expect(tab.getStoredSession(true)).toBeNull();
    b.localStorage.setItem('mgh.session', 'not json');
    expect(tab.getStoredSession(true)).toBeNull();
  });
});
