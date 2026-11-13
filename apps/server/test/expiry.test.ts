import { describe, expect, it } from 'vitest';
import { Bot, sleep, startTestServer } from './helpers';

// Separate file: Colyseus' matchmaker is process-global, so each file owns exactly one server.
describe('room expiration', () => {
  it('disposes abandoned rooms and frees their codes', async () => {
    const srv = await startTestServer({ timing: { idleTtlMs: 600, graceMs: 300, unclaimedTtlMs: 600 } });
    try {
      const h = await new Bot(srv.url, 'Lonely').create();
      const code = h.party!.code;
      expect(srv.app.runtime.rooms.size).toBe(1);
      await h.room.leave(true);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && srv.app.runtime.rooms.size > 0) await sleep(100);
      expect(srv.app.runtime.rooms.size).toBe(0);
      expect(srv.app.runtime.codes.has(code)).toBe(false);
      const info = await fetch(`${srv.url}/api/rooms/${code}`).then((r) => r.json());
      expect(info.exists).toBe(false);
      await expect(new Bot(srv.url, 'Late').join(code)).rejects.toThrow();
    } finally {
      await srv.close();
    }
  });

  it('disposes a room nobody ever joined (e.g. failed auth on create)', async () => {
    const srv = await startTestServer({ timing: { idleTtlMs: 5000, unclaimedTtlMs: 700 } });
    try {
      const { Client } = await import('@colyseus/sdk');
      await new Client(srv.url).create('party', { token: 'bogus-token-bogus', nickname: 'X1', avatar: 'comet' }).catch(() => {});
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && srv.app.runtime.rooms.size > 0) await sleep(100);
      expect(srv.app.runtime.rooms.size).toBe(0);
    } finally {
      await srv.close();
    }
  });
});
