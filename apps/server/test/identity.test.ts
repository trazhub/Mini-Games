import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createPgRepository, noopRepository, type Repository } from '../src/db/repository';
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from '../src/recovery';
import { issueGuestSession, refreshGuestSession, verifySession } from '../src/session';
import { getGuest, startTestServer, type TestServer } from './helpers';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
const HOUR = 3600_000;
const YEAR_MS = 8760 * HOUR;
const SECRET = 'x'.repeat(48);
const OTHER_SECRET = 'y'.repeat(48);
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

let client: PGlite;
let db: ReturnType<typeof drizzle>;
let repo: Repository;
let srv: TestServer; // with database
let bare: TestServer; // without database

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  repo = createPgRepository(db, async () => {});
  srv = await startTestServer({ repo });
  bare = await startTestServer();
});
afterAll(async () => {
  await srv.close();
  await bare.close();
  await client.close();
});
afterEach(() => vi.restoreAllMocks());

const json = { 'content-type': 'application/json' };

async function postGuest(url: string, opts: { bearer?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...json, ...opts.headers };
  if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
  const res = await fetch(`${url}/api/guest`, { method: 'POST', headers, body: JSON.stringify(opts.body ?? {}) });
  const text = await res.text();
  return { status: res.status, text, body: (text ? JSON.parse(text) : null) as { guestId: string; token: string; expiresAt: number; error?: string } };
}

async function getCode(url: string, token: string) {
  const res = await fetch(`${url}/api/guest/recovery`, { method: 'POST', headers: { ...json, authorization: `Bearer ${token}` }, body: '{}' });
  return { status: res.status, body: (await res.json()) as { code: string; error?: string } };
}

async function restore(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${url}/api/guest/restore`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as { guestId: string; token: string; expiresAt: number; error?: string } };
}

describe('refreshable session tokens', () => {
  it('refresh keeps the guest id and extends expiry', async () => {
    const t0 = 1_700_000_000_000;
    const first = issueGuestSession(SECRET, YEAR_MS, t0);
    const later = t0 + 30 * 24 * HOUR;
    const refreshed = refreshGuestSession(SECRET, YEAR_MS, first.token, later);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.guestId).toBe(first.guestId);
    expect(refreshed!.expiresAt).toBe(later + YEAR_MS);
    expect(refreshed!.expiresAt).toBeGreaterThan(first.expiresAt);
    expect(verifySession(SECRET, refreshed!.token, later)!.sub).toBe(first.guestId);

    // Over HTTP: the Bearer header and the body resumeToken both refresh the same guest.
    const g = await getGuest(srv.url);
    const viaHeader = await postGuest(srv.url, { bearer: g.token });
    expect(viaHeader.status).toBe(200);
    expect(viaHeader.body.guestId).toBe(g.guestId);
    const viaBody = await postGuest(srv.url, { body: { resumeToken: g.token } });
    expect(viaBody.status).toBe(200);
    expect(viaBody.body.guestId).toBe(g.guestId);
    expect(viaBody.body.expiresAt).toBeGreaterThan(Date.now() + YEAR_MS - HOUR);
  });

  it('refreshes tokens issued before this change (24 h TTL, same secret) without a forced logout', async () => {
    const old = issueGuestSession(srv.config.sessionSecret, 24 * HOUR, Date.now() - HOUR);
    const r = await postGuest(srv.url, { bearer: old.token });
    expect(r.status).toBe(200);
    expect(r.body.guestId).toBe(old.guestId);
    expect(r.body.expiresAt).toBeGreaterThan(Date.now() + YEAR_MS - HOUR);
  });

  it('refreshGuestSession returns null for non-string, expired, tampered and foreign tokens', () => {
    const now = Date.now();
    expect(refreshGuestSession(SECRET, YEAR_MS, undefined, now)).toBeNull();
    expect(refreshGuestSession(SECRET, YEAR_MS, 42, now)).toBeNull();
    expect(refreshGuestSession(SECRET, YEAR_MS, { token: 'x' }, now)).toBeNull();
    const expired = issueGuestSession(SECRET, HOUR, now - 2 * HOUR);
    expect(refreshGuestSession(SECRET, YEAR_MS, expired.token, now)).toBeNull();
    const foreign = issueGuestSession(OTHER_SECRET, YEAR_MS, now);
    expect(refreshGuestSession(SECRET, YEAR_MS, foreign.token, now)).toBeNull();
  });

  it('expired token yields a new guest', async () => {
    const expired = issueGuestSession(srv.config.sessionSecret, HOUR, Date.now() - 3 * HOUR);
    for (const opts of [{ bearer: expired.token }, { body: { resumeToken: expired.token } }]) {
      const r = await postGuest(srv.url, opts);
      expect(r.status).toBe(201);
      expect(r.body.guestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.body.guestId).not.toBe(expired.guestId);
      expect(verifySession(srv.config.sessionSecret, r.body.token)!.sub).toBe(r.body.guestId);
    }
  });

  it('tampered token yields a new guest', async () => {
    const real = issueGuestSession(srv.config.sessionSecret, YEAR_MS);
    const [body, sig] = real.token.split('.') as [string, string];
    const victim = crypto.randomUUID();
    const forgedBody = Buffer.from(JSON.stringify({ sub: victim, iat: Date.now(), exp: Date.now() + YEAR_MS })).toString('base64url');
    const flippedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    for (const tok of [`${forgedBody}.${sig}`, `${body}.${flippedSig}`, `${body}.`, body, '.', '']) {
      for (const opts of [{ bearer: tok }, { body: { resumeToken: tok } }]) {
        const r = await postGuest(srv.url, opts);
        expect(r.status).toBe(201);
        expect(r.body.guestId).not.toBe(real.guestId);
        expect(r.body.guestId).not.toBe(victim);
      }
    }
  });

  it('token signed with another secret yields a new guest', async () => {
    const foreign = issueGuestSession(OTHER_SECRET, YEAR_MS);
    for (const opts of [{ bearer: foreign.token }, { body: { resumeToken: foreign.token } }]) {
      const r = await postGuest(srv.url, opts);
      expect(r.status).toBe(201);
      expect(r.body.guestId).not.toBe(foreign.guestId);
    }
  });

  it('garbage or oversized Authorization / resumeToken never crash and are never echoed or logged', async () => {
    const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const marker = 'GARBAGEMARKER';
    const cases: { opts: Parameters<typeof postGuest>[1]; expect: number[] }[] = [
      { opts: { headers: { authorization: `Bearer ${marker}${'z'.repeat(8000)}` } }, expect: [201] },
      { opts: { headers: { authorization: `Basic ${marker}` } }, expect: [201] },
      { opts: { headers: { authorization: `Bearer ${marker}.${marker}` } }, expect: [201] },
      { opts: { body: { resumeToken: `${marker}${'q'.repeat(1500)}` } }, expect: [201] },
      { opts: { body: { resumeToken: `${marker}${'q'.repeat(5000)}` } }, expect: [400, 413] },
    ];
    for (const c of cases) {
      const r = await postGuest(srv.url, c.opts);
      expect(c.expect).toContain(r.status);
      expect(r.text).not.toContain(marker);
    }
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain(marker);
  });

  it('default session lifetime is 8760 hours', async () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).SESSION_TTL_HOURS).toBe(8760);
    const before = Date.now();
    const r = await postGuest(srv.url);
    expect(r.status).toBe(201);
    expect(r.body.expiresAt).toBeGreaterThanOrEqual(before + YEAR_MS);
    expect(r.body.expiresAt).toBeLessThanOrEqual(Date.now() + YEAR_MS);
  });
});

describe('recovery codes', () => {
  it('generates 16 Crockford base32 chars in 4 groups with fresh randomness', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateRecoveryCode();
      expect(c).toMatch(CODE_RE);
      expect(normalizeRecoveryCode(c)).toBe(c);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });

  it('normalizeRecoveryCode accepts lowercase, spaces and dashes, rejects wrong length and look-alike chars', () => {
    expect(normalizeRecoveryCode('abcd-efgh-jkmn-pqrs')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeRecoveryCode(' abcd efgh  jkmn pqrs ')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeRecoveryCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeRecoveryCode('0123-4567-89vw-xyzt')).toBe('0123-4567-89VW-XYZT');
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQR')).toBeNull(); // 15
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQRST')).toBeNull(); // 17
    expect(normalizeRecoveryCode('')).toBeNull();
    for (const bad of ['I', 'L', 'O', 'U', 'i', 'l', 'o', 'u', '!', '_', 'Ä']) {
      expect(normalizeRecoveryCode(`ABCD-EFGH-JKMN-PQR${bad}`)).toBeNull();
    }
    expect(normalizeRecoveryCode('A'.repeat(10_000))).toBeNull();
    expect(normalizeRecoveryCode(42 as unknown as string)).toBeNull();
  });

  it('hashes with a key derived from the secret (domain separated), never the raw secret', async () => {
    const { createHmac } = await import('node:crypto');
    const code = 'ABCD-EFGH-JKMN-PQRS';
    const h = hashRecoveryCode(code, SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('abcd efgh jkmn pqrs', SECRET)).toBe(h);
    expect(hashRecoveryCode(code, OTHER_SECRET)).not.toBe(h);
    // Not keyed directly by SESSION_SECRET (in any of the plausible input spellings).
    for (const input of [code, 'ABCDEFGHJKMNPQRS']) {
      expect(createHmac('sha256', SECRET).update(input).digest('hex')).not.toBe(h);
    }
    expect(() => hashRecoveryCode('nope', SECRET)).toThrow();
  });

  it('recovery code round-trips: create guest, get code, restore returns the same guestId', async () => {
    const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const g = await getGuest(srv.url);
    const issued = await getCode(srv.url, g.token);
    expect(issued.status).toBe(200);
    expect(issued.body.code).toMatch(CODE_RE);

    // Only the HMAC hash is stored, never the plain code.
    const res = await db.execute(sql`select recovery_hash from guests where id = ${g.guestId}`);
    const stored = (res.rows[0] as { recovery_hash: string }).recovery_hash;
    expect(stored).toBe(hashRecoveryCode(issued.body.code, srv.config.sessionSecret));
    expect(stored).not.toContain(issued.body.code.replace(/-/g, ''));
    const dump = await db.execute(sql`select * from guests`);
    expect(JSON.stringify(dump.rows)).not.toContain(issued.body.code.replace(/-/g, ''));
    expect(JSON.stringify(dump.rows)).not.toContain(issued.body.code);

    const r = await restore(srv.url, { code: issued.body.code.toLowerCase().replace(/-/g, ' ') });
    expect(r.status).toBe(200);
    expect(r.body.guestId).toBe(g.guestId);
    expect(r.body.expiresAt).toBeGreaterThan(Date.now() + YEAR_MS - HOUR);
    expect(verifySession(srv.config.sessionSecret, r.body.token)!.sub).toBe(g.guestId);
    // Restoring revokes nothing: the original device's token still works.
    expect((await postGuest(srv.url, { bearer: g.token })).body.guestId).toBe(g.guestId);

    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain(issued.body.code);
  });

  it('regenerating a code invalidates the previous one', async () => {
    const g = await getGuest(srv.url);
    const first = (await getCode(srv.url, g.token)).body.code;
    const second = (await getCode(srv.url, g.token)).body.code;
    expect(second).not.toBe(first);
    const old = await restore(srv.url, { code: first });
    expect(old.status).toBe(404);
    expect(old.body.error).toBe('unknown_code');
    const cur = await restore(srv.url, { code: second });
    expect(cur.status).toBe(200);
    expect(cur.body.guestId).toBe(g.guestId);
  });

  it('restore rejects malformed input with 400 invalid_code and unknown codes with 404, without echoing input', async () => {
    const own = await startTestServer({ repo }); // own restore limiter bucket
    try {
      for (const body of [{ code: 'ABCD-EFGH-JKMN-PQRI' }, { code: 'short' }, { code: 123 }, {}, { code: 'X'.repeat(1500) }]) {
        const r = await restore(own.url, body);
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('invalid_code');
        expect(r.text).not.toContain('PQRI');
      }
      const unknown = await restore(own.url, { code: generateRecoveryCode() });
      expect(unknown.status).toBe(404);
      expect(unknown.body.error).toBe('unknown_code');
    } finally {
      await own.close();
    }
  });

  it('POST /api/guest/recovery without a valid Bearer token returns 401', async () => {
    for (const s of [srv, bare]) {
      const none = await fetch(`${s.url}/api/guest/recovery`, { method: 'POST', headers: json, body: '{}' });
      expect(none.status).toBe(401);
      const expired = issueGuestSession(s.config.sessionSecret, HOUR, Date.now() - 3 * HOUR);
      const foreign = issueGuestSession(OTHER_SECRET, YEAR_MS);
      for (const tok of ['garbage', expired.token, foreign.token, 'x'.repeat(6000)]) {
        const r = await getCode(s.url, tok);
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: 'unauthorized' });
      }
    }
  });

  it('restore without a database returns 501', async () => {
    const r = await restore(bare.url, { code: generateRecoveryCode() });
    expect(r.status).toBe(501);
    expect(r.body).toEqual({ error: 'recovery_unavailable' });
    const g = await getGuest(bare.url);
    const c = await getCode(bare.url, g.token);
    expect(c.status).toBe(501);
    expect(c.body).toEqual({ error: 'recovery_unavailable' });
  });

  it('restore is rate limited after 10 attempts', async () => {
    const limited = await startTestServer({ repo });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await restore(limited.url, { code: generateRecoveryCode() })).status);
      expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      const r = await restore(limited.url, { code: generateRecoveryCode() });
      expect(r.body).toEqual({ error: 'rate_limited' });
      // A valid code is also refused while limited (no oracle), and the guest limiter is separate.
      expect((await postGuest(limited.url)).status).toBe(201);
    } finally {
      await limited.close();
    }
  });

  it('restore limiter keys off the same client-IP logic as the guest limiter (trust proxy)', async () => {
    const proxied = await startTestServer({ repo, env: { TRUST_PROXY: 'true' } });
    const direct = await startTestServer({ repo, env: { TRUST_PROXY: 'false' } });
    try {
      // Behind a trusted proxy, distinct X-Forwarded-For clients get distinct buckets.
      for (let i = 0; i < 10; i++) expect((await restore(proxied.url, { code: generateRecoveryCode() }, { 'x-forwarded-for': '203.0.113.7' })).status).toBe(404);
      expect((await restore(proxied.url, { code: generateRecoveryCode() }, { 'x-forwarded-for': '203.0.113.7' })).status).toBe(429);
      expect((await restore(proxied.url, { code: generateRecoveryCode() }, { 'x-forwarded-for': '198.51.100.8' })).status).toBe(404);
      // Without trust proxy, a spoofed X-Forwarded-For does not buy a fresh bucket.
      for (let i = 0; i < 10; i++) {
        expect((await restore(direct.url, { code: generateRecoveryCode() }, { 'x-forwarded-for': `203.0.113.${i + 1}` })).status).toBe(404);
      }
      expect((await restore(direct.url, { code: generateRecoveryCode() }, { 'x-forwarded-for': '198.51.100.99' })).status).toBe(429);
    } finally {
      await proxied.close();
      await direct.close();
    }
  });
});

describe('repository recovery hash', () => {
  it('stores, replaces and looks up the hash; recovery_hash is nullable and unique', async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await repo.upsertGuest(a);
    const nul = await db.execute(sql`select recovery_hash from guests where id = ${a}`);
    expect((nul.rows[0] as { recovery_hash: string | null }).recovery_hash).toBeNull();
    await repo.upsertGuest(b); // two NULLs coexist under the unique index
    await repo.setRecoveryHash(a, 'h1'.padEnd(64, '0'));
    expect(await repo.findGuestByRecoveryHash('h1'.padEnd(64, '0'))).toBe(a);
    await repo.setRecoveryHash(a, 'h2'.padEnd(64, '0'));
    expect(await repo.findGuestByRecoveryHash('h1'.padEnd(64, '0'))).toBeNull();
    expect(await repo.findGuestByRecoveryHash('h2'.padEnd(64, '0'))).toBe(a);
    await expect(repo.setRecoveryHash(b, 'h2'.padEnd(64, '0'))).rejects.toThrow();
    // setRecoveryHash also works before the fire-and-forget upsert has landed.
    const c = crypto.randomUUID();
    await repo.setRecoveryHash(c, 'h3'.padEnd(64, '0'));
    expect(await repo.findGuestByRecoveryHash('h3'.padEnd(64, '0'))).toBe(c);
    const idx = await db.execute(sql`select indexdef from pg_indexes where tablename = 'guests'`);
    expect(JSON.stringify(idx.rows)).toMatch(/UNIQUE INDEX[^"]*recovery_hash/i);
  });

  it('noop repository: setRecoveryHash is a no-op and lookups return null', async () => {
    await expect(noopRepository.setRecoveryHash(crypto.randomUUID(), 'x')).resolves.toBeUndefined();
    expect(await noopRepository.findGuestByRecoveryHash('x')).toBeNull();
  });
});
