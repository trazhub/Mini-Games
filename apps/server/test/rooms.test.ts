import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Bot, makeParty, startTestServer, type TestServer } from './helpers';

let srv: TestServer;
const bots: Bot[] = [];
const track = <T extends Bot>(...b: T[]) => (bots.push(...b), b);

beforeAll(async () => {
  srv = await startTestServer();
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
});

describe('rooms', () => {
  it('creates a room with a 5 char code and makes the creator host', async () => {
    const host = track(await new Bot(srv.url, 'Alice', 'fox').create())[0]!;
    expect(host.party!.code).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    expect(host.party!.hostId).toBe(host.playerId);
    expect(host.party!.players[0]).toMatchObject({ name: 'Alice', avatar: 'fox', isHost: true, connected: true });
    expect(host.party!.phase).toBe('lobby');
  });

  it('lets a second player join by code and shows both to everyone', async () => {
    const [host, guest] = track(...(await makeParty(srv.url, 2, { ready: false })));
    await guest!.until((b) => b.party!.players.length === 2);
    expect(guest!.party!.code).toBe(host!.party!.code);
    expect(guest!.party!.players.map((p) => p.name).sort()).toEqual(['Host', 'Player1']);
    expect(guest!.me()!.isHost).toBe(false);
  });

  it('rejects an invalid room code', async () => {
    const b = new Bot(srv.url, 'Nobody');
    await expect(b.join('ZZZZZ')).rejects.toThrow();
  });

  it('rejects a full room (12 players)', async () => {
    const all = track(...(await makeParty(srv.url, 12, { ready: false })));
    const extra = new Bot(srv.url, 'TooMany');
    await expect(extra.join(all[0]!.party!.code)).rejects.toThrow(/full/i);
    expect(all[0]!.party!.players).toHaveLength(12);
  });

  it('dedupes display names without using them for identity', async () => {
    const host = track(await new Bot(srv.url, 'Sam').create())[0]!;
    const twin = track(await new Bot(srv.url, 'Sam').join(host.party!.code))[0]!;
    await host.until((b) => b.party!.players.length === 2);
    const names = host.party!.players.map((p) => p.name);
    expect(new Set(names).size).toBe(2);
    expect(twin.playerId).not.toBe(host.playerId);
  });

  it('sanitizes nicknames and rejects unusable ones', async () => {
    const ok = track(await new Bot(srv.url, '  <b>Zoe</b>​  ').create())[0]!;
    expect(ok.party!.players[0]!.name).toBe('bZoe/b');
    await expect(new Bot(srv.url, ' ​ ').create()).rejects.toThrow();
  });

  it('migrates host when the host disconnects and keeps the party alive', async () => {
    const [host, b, c] = track(...(await makeParty(srv.url, 3, { ready: false })));
    host!.drop();
    await b!.until((x) => x.party!.hostId === b!.playerId || x.party!.hostId === c!.playerId, 5000, 'host migration');
    expect(b!.party!.hostId).not.toBe(host!.playerId);
    expect(b!.party!.players.find((p) => p.id === host!.playerId)!.connected).toBe(false);
  });

  it('marks a dropped player disconnected, then lets them reconnect with the same identity', async () => {
    const [host, p] = track(...(await makeParty(srv.url, 2, { ready: false })));
    const id = p!.playerId;
    p!.drop();
    await host!.until((b) => b.party!.players.find((x) => x.id === id)?.connected === false, 5000, 'disconnect');
    await p!.rejoin(host!.party!.code);
    await host!.until((b) => b.party!.players.find((x) => x.id === id)?.connected === true, 5000, 'reconnect');
    expect(p!.playerId).toBe(id);
    expect(host!.party!.players).toHaveLength(2);
  });

  it('removes a player after the reconnection grace period', async () => {
    const [host, p] = track(...(await makeParty(srv.url, 2, { ready: false })));
    p!.drop();
    await host!.until((b) => b.party!.players.length === 1, 6000, 'grace expiry');
  });

  it('removes a player immediately on a consented leave', async () => {
    const [host, p] = track(...(await makeParty(srv.url, 2, { ready: false })));
    await p!.room.leave(true);
    await host!.until((b) => b.party!.players.length === 1, 3000, 'leave');
  });

  it('takes over a duplicate connection (newest wins)', async () => {
    const [host, p] = track(...(await makeParty(srv.url, 2, { ready: false })));
    const second = track(new Bot(srv.url, 'Player1'))[0]!;
    second.token = p!.token;
    second.guestId = p!.guestId;
    await second.rejoin(host!.party!.code);
    await p!.until((b) => b.leftCode !== null, 4000, 'old connection closed');
    expect(p!.kicked).toMatch(/another tab/i);
    expect(host!.party!.players).toHaveLength(2);
    expect(second.playerId).toBe(p!.playerId);
  });

  it('reports room info over HTTP without leaking members', async () => {
    const [host] = track(...(await makeParty(srv.url, 2, { ready: false })));
    const info = await fetch(`${srv.url}/api/rooms/${host!.party!.code.toLowerCase()}`).then((r) => r.json());
    expect(info).toMatchObject({ exists: true, players: 2, capacity: 12, phase: 'lobby', joinable: true });
    expect(JSON.stringify(info)).not.toMatch(/Host|Player1/);
  });
});
