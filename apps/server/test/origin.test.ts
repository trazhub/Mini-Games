import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueGuestSession } from '../src/session';
import { Bot, startTestServer, type TestServer } from './helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer({ env: { ALLOWED_ORIGINS: 'https://good.example', JOIN_RATE_PER_MIN: '6', GUEST_RATE_PER_MIN: '4' } });
});
afterAll(async () => srv.close());

describe('origin and rate limit enforcement', () => {
  it('sets CORS headers only for allowed origins on the API', async () => {
    const ok = await fetch(`${srv.url}/health`, { headers: { origin: 'https://good.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://good.example');
    const bad = await fetch(`${srv.url}/api/guest`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await fetch(`${srv.url}/api/guest`, {
      method: 'OPTIONS',
      headers: { origin: 'https://good.example', 'access-control-request-method': 'POST' },
    });
    expect(pre.status).toBe(204);
  });

  it('sets matchmaking CORS headers for allowed origins only', async () => {
    const good = await fetch(`${srv.url}/matchmake/create/party`, { method: 'OPTIONS', headers: { origin: 'https://good.example' } });
    expect(good.headers.get('access-control-allow-origin')).toBe('https://good.example');
    // Regression: the SDK uses credentials:"include", which browsers only allow with this header.
    expect(good.headers.get('access-control-allow-credentials')).toBe('true');
    const evil = await fetch(`${srv.url}/matchmake/create/party`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses WebSocket upgrades from disallowed browser origins', async () => {
    const attempt = (origin: string) =>
      new Promise<'open' | number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/anything`, { headers: { origin } });
        ws.on('open', () => {
          ws.close();
          resolve('open');
        });
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        ws.on('error', () => resolve(-1));
      });
    expect(await attempt('https://evil.example')).toBe(403);
    expect(await attempt('https://good.example')).not.toBe(403);
  });

  it('rate limits guest session creation per IP', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await fetch(`${srv.url}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 4).every((c) => c === 201)).toBe(true);
    expect(codes.slice(4).every((c) => c === 429)).toBe(true);
  });

  it('rate limits repeated room joins per IP', async () => {
    const results: string[] = [];
    let limited = 0;
    for (let i = 0; i < 10; i++) {
      const bot = new Bot(srv.url, `Spam${i}`);
      bot.token = issueGuestSession(srv.config.sessionSecret, 60_000).token;
      try {
        await bot.create();
        results.push('ok');
        await bot.close();
      } catch (e) {
        results.push('err');
        if (/too many/i.test(String((e as Error)?.message))) limited++;
      }
    }
    expect(results.slice(0, 6).every((r) => r === 'ok')).toBe(true);
    expect(limited).toBeGreaterThan(0);
  });

  it('keeps /metrics private (proxy header => hidden) while exposing no secrets locally', async () => {
    const viaProxy = await fetch(`${srv.url}/metrics`, { headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(viaProxy.status).toBe(404);
    const local = await fetch(`${srv.url}/metrics`);
    expect(local.status).toBe(200);
    const body = await local.json();
    expect(body).toHaveProperty('tick');
    expect(JSON.stringify(body)).not.toMatch(/secret|token|password/i);
  });
});
