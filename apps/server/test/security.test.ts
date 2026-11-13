import { Client } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { issueGuestSession } from '../src/session';
import { Bot, getGuest, makeParty, sleep, startTestServer, type TestServer } from './helpers';

let srv: TestServer;
const bots: Bot[] = [];
const track = (list: Bot[]) => (bots.push(...list), list);

const MT = { rounds: 2, introMs: 100, answerMs: 1500, revealMs: 150, latencyGraceMs: 100 };

beforeAll(async () => {
  srv = await startTestServer({ gameConfig: { 'majority-trap': MT }, timing: { startDelayMs: 50, graceMs: 3000 } });
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
});

async function startMajority(players: Bot[]) {
  const host = players[0]!;
  host.send('selectGame', { gameId: 'majority-trap' });
  await host.until((b) => b.party!.selectedGameId === 'majority-trap');
  host.send('start');
  await Promise.all(players.map((p) => p.until((b) => b.gameState?.phase === 'question', 5000, 'question')));
}

describe('host authorization', () => {
  it('non-hosts cannot select, start, rematch, return to lobby or kick', async () => {
    const [host, a, b] = track(await makeParty(srv.url, 3));
    a!.send('selectGame', { gameId: 'majority-trap' });
    a!.send('start');
    a!.send('rematch');
    a!.send('backToLobby');
    a!.send('kick', { playerId: b!.playerId });
    await sleep(300);
    expect(a!.notices.filter((n) => /only the host/i.test(n)).length).toBe(5);
    expect(host!.party!.players).toHaveLength(3);
    expect(host!.party!.phase).toBe('lobby');
    expect(host!.party!.selectedGameId).toBeNull();
  });

  it('host cannot kick themselves or unknown players; client-sent playerId is never trusted', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    host!.send('kick', { playerId: host!.playerId });
    host!.send('kick', { playerId: 'does-not-exist' });
    a!.send('ready', { ready: false, playerId: host!.playerId });
    await sleep(250);
    expect(host!.party!.players).toHaveLength(2);
    expect(host!.party!.players.find((p) => p.id === a!.playerId)!.ready).toBe(false);
    expect(host!.party!.players.find((p) => p.id === host!.playerId)!.ready).toBe(true);
  });

  it('host can remove a disruptive player; they cannot rejoin with the same session', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    const code = host!.party!.code;
    host!.send('kick', { playerId: a!.playerId });
    await host!.until((b) => b.party!.players.length === 1, 3000, 'kicked');
    await a!.until((b) => b.kicked !== null || b.leftCode !== null, 3000, 'kick notice');
    expect(a!.kicked).toMatch(/removed/i);
    await expect(a!.rejoin(code)).rejects.toThrow(/removed/i);
  });

  it('host cannot start a game without enough players', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    host!.send('selectGame', { gameId: 'majority-trap' });
    host!.send('start');
    await host!.until((b) => b.notices.some((n) => /at least 3/.test(n)), 3000, 'min players');
    expect(host!.party!.phase).toBe('lobby');
    expect(a!.party!.phase).toBe('lobby');
  });
});

describe('score forging and action abuse', () => {
  it('ignores forged scores and extra fields; identity comes from the connection only', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    await startMajority(players);
    const cheater = players[1]!;
    cheater.send('g:action', { type: 'score', value: 99999 });
    cheater.send('g:action', { type: 'answer', answer: 'A', predict: 'B', points: 1000, playerId: host.playerId });
    await cheater.until((b) => !!b.gameState.mine, 3000, 'accepted answer');
    await sleep(100);
    expect(host.gameState.submitted).toEqual([cheater.playerId]);
    for (const p of players) p.send('g:action', { type: 'answer', answer: 'B', predict: 'A' });
    await Promise.all(players.map((p) => p.until((b) => !!b.results, 10000, 'results')));
    const scores = host.results!.rankings.map((r) => r.score);
    expect(Math.max(...scores)).toBeLessThanOrEqual(300); // 2 rounds x at most 150
  });

  it('rejects duplicate actions (second answer does not overwrite the first)', async () => {
    const players = track(await makeParty(srv.url, 3));
    await startMajority(players);
    const p = players[1]!;
    p.send('g:action', { type: 'answer', answer: 'A', predict: 'B' });
    await p.until((b) => !!b.gameState.mine);
    p.send('g:action', { type: 'answer', answer: 'B', predict: 'A' });
    await p.until((b) => b.eventsOf('rejected').length > 0, 3000, 'duplicate rejected');
    expect(p.gameState.mine).toEqual({ answer: 'A', predict: 'B' });
  });

  it('spectators cannot act', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    await startMajority(players);
    const late = track([await new Bot(srv.url, 'Late').join(host.party!.code)])[0]!;
    late.send('g:action', { type: 'answer', answer: 'A', predict: 'B' });
    await sleep(200);
    expect(host.gameState.submitted).not.toContain(late.playerId);
  });
});

describe('malformed input handling', () => {
  it('survives malformed payloads of many kinds without crashing the room', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    const junk: unknown[] = [null, undefined, 42, 'str', [], {}, { ready: 'yes' }, { type: 5 }, { gameId: {} }, { nickname: 1, avatar: 'nope' }, { type: 'x'.repeat(500) }];
    const before = srv.app.runtime.metrics.counters.malformed;
    for (const j of junk) {
      for (const t of ['ready', 'selectGame', 'vote', 'kick', 'profile', 'g:action']) {
        try {
          a!.send(t, j);
        } catch {
          /* client-side encode errors are fine */
        }
      }
      await sleep(5);
    }
    await sleep(200);
    expect(host!.party!.phase).toBe('lobby');
    expect(srv.app.runtime.metrics.counters.malformed - before).toBeGreaterThan(5);
  });

  it('unknown message types are ignored rather than fatal', async () => {
    const [host] = track(await makeParty(srv.url, 1));
    host!.send('totally-unknown', { a: 1 });
    await sleep(100);
    expect(host!.leftCode).toBeNull();
  });

  it('disconnects oversized messages (transport maxPayload)', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    try {
      a!.send('profile', { nickname: 'x'.repeat(5000), avatar: 'comet' });
    } catch {
      /* ignore */
    }
    await a!.until((b) => b.leftCode !== null, 4000, 'oversize disconnect');
    expect(host!.party!.phase).toBe('lobby');
  });

  it('rate limits message floods and disconnects the offender', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    for (let i = 0; i < 400; i++) a!.send('ping', { t: i });
    await a!.until((b) => b.leftCode !== null, 5000, 'flood disconnect');
    expect(srv.app.runtime.metrics.counters.rateLimited).toBeGreaterThan(0);
    expect(host!.party!.phase).toBe('lobby');
  });

  it('sanitizes profile updates and keeps nicknames unique', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    a!.send('profile', { nickname: '<script>x</script>', avatar: 'fox' });
    await host!.until((b) => b.party!.players.some((p) => p.avatar === 'fox'), 3000, 'profile update');
    const n = host!.party!.players.find((p) => p.avatar === 'fox')!.name;
    expect(n).not.toMatch(/[<>]/);
    a!.send('profile', { nickname: 'Host', avatar: 'fox' });
    await host!.until((b) => b.party!.players.find((p) => p.id === a!.playerId)!.name !== n, 3000, 'rename');
    const names = host!.party!.players.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(2);
  });
});

describe('session credential misuse', () => {
  it('rejects forged, tampered, expired and malformed tokens', async () => {
    const [host] = track(await makeParty(srv.url, 1));
    const code = host!.party!.code;
    const good = await getGuest(srv.url);
    const [body, sig] = good.token.split('.');
    const forged = issueGuestSession('x'.repeat(40), 60_000).token; // wrong secret
    const expired = issueGuestSession(srv.config.sessionSecret, 1000, Date.now() - 10_000).token;
    const swappedBody = Buffer.from(JSON.stringify({ sub: host!.guestId, iat: 1, exp: Date.now() + 99999 })).toString('base64url');
    const tokens = [forged, expired, `${swappedBody}.${sig}`, `${body}.${'A'.repeat(sig!.length)}`, 'garbage-garbage', 'x'.repeat(40)];
    for (const token of tokens) {
      const c = new Client(srv.url);
      await expect(c.joinById(code, { token, nickname: 'Eve', avatar: 'comet' })).rejects.toThrow();
    }
    expect(host!.party!.players).toHaveLength(1);
  });

  it('another guest cannot act as someone else by sending their player id', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    const eve = track([new Bot(srv.url, 'Eve')])[0]!;
    await eve.join(host!.party!.code);
    expect(eve.playerId).not.toBe(a!.playerId);
    eve.send('ready', { ready: true, playerId: a!.playerId });
    eve.send('kick', { playerId: host!.playerId });
    await sleep(200);
    expect(host!.party!.players).toHaveLength(3);
    expect(host!.party!.players.find((p) => p.id === a!.playerId)!.ready).toBe(true); // unchanged (was ready from makeParty)
  });

  it('only the holder of the token resumes the identity, replacing the old connection', async () => {
    const [host, a] = track(await makeParty(srv.url, 2));
    const resumed = track([new Bot(srv.url, 'Whoever')])[0]!;
    resumed.token = a!.token;
    resumed.guestId = a!.guestId;
    await resumed.rejoin(host!.party!.code);
    expect(resumed.playerId).toBe(a!.playerId);
    await a!.until((b) => b.leftCode !== null, 3000, 'previous connection replaced');
    expect(host!.party!.players).toHaveLength(2);
  });
});
