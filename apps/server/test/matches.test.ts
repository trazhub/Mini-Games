import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Bot, makeParty, sleep, startTestServer, type TestServer } from './helpers';

let srv: TestServer;
const bots: Bot[] = [];
const track = (list: Bot[]) => (bots.push(...list), list);

const MT = { rounds: 2, introMs: 100, answerMs: 600, revealMs: 150, latencyGraceMs: 100 };
const ECHO = { introMs: 100, watchLeadMs: 50, stepMs: 60, inputBaseMs: 400, inputPerStepMs: 50, latencyGraceMs: 100, resultMs: 100, maxRounds: 3 };
const ORBIT = { matchMs: 1200, countdownMs: 150, snapshotMs: 50 };

beforeAll(async () => {
  srv = await startTestServer({
    gameConfig: { 'majority-trap': MT, 'echo-steps': ECHO, 'orbit-swap': ORBIT },
    timing: { startDelayMs: 80, graceMs: 3000 },
  });
});
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.close()));
});
afterAll(async () => {
  await srv.close();
});

async function startGame(host: Bot, gameId: string) {
  host.send('selectGame', { gameId });
  await host.until((b) => b.party!.selectedGameId === gameId, 3000, 'game selected');
  host.send('start');
}

/** Everyone answers every Majority Trap round (answer A, predict B unless `pattern` says otherwise). */
async function playMajorityTrap(players: Bot[]) {
  const answered = new Set<string>();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !players[0]!.results) {
    for (const p of players) {
      const s = p.gameState;
      if (s?.phase === 'question' && !s.mine) {
        const i = players.indexOf(p);
        p.send('g:action', { type: 'answer', answer: i === 0 ? 'A' : 'B', predict: i === 0 ? 'B' : 'A' });
        answered.add(`${s.round}:${p.playerId}`);
      }
    }
    await sleep(25);
  }
  return answered;
}

describe('party -> game -> party handoff', () => {
  it('only the host can start; requires ready players and the minimum player count', async () => {
    const [host, p1] = track(await makeParty(srv.url, 2, { ready: false }));
    p1!.send('start');
    await p1!.until((b) => b.notices.some((n) => /host/i.test(n)), 3000, 'non-host rejected');
    host!.send('selectGame', { gameId: 'majority-trap' });
    await host!.until((b) => b.party!.selectedGameId === 'majority-trap');
    host!.send('start');
    await host!.until((b) => b.notices.some((n) => /at least 3/.test(n)), 3000, 'min players');
    expect(host!.party!.phase).toBe('lobby');
  });

  it('refuses to start while someone is not ready', async () => {
    const bs = track(await makeParty(srv.url, 3, { ready: false }));
    const [host, a] = bs;
    a!.send('ready', { ready: true });
    host!.send('selectGame', { gameId: 'majority-trap' });
    await host!.until((b) => b.party!.selectedGameId === 'majority-trap');
    host!.send('start');
    await host!.until((b) => b.notices.some((n) => /ready up/.test(n)), 3000, 'ready check');
    expect(host!.party!.phase).toBe('lobby');
  });

  it('runs a full Majority Trap match, scores it on the server, then returns to the same party', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    const memberIds = host.party!.players.map((p) => p.id).sort();
    await startGame(host, 'majority-trap');
    await host.until((b) => b.party!.phase === 'starting', 3000, 'starting');
    await Promise.all(players.map((p) => p.until((b) => b.gameStart?.gameId === 'majority-trap' && !!b.gameState, 5000, 'game start')));
    expect(host.gameStart!.participantIds.sort()).toEqual(memberIds);
    await playMajorityTrap(players);
    await Promise.all(players.map((p) => p.until((b) => !!b.results, 10000, 'results')));

    const r = host.results!;
    expect(r.gameId).toBe('majority-trap');
    expect(r.rankings).toHaveLength(3);
    // p0 (host) answers A / predicts B; others answer B / predict A => minority is A
    // host: lone wolf 50 per round (prediction wrong) = 100; others 100 per round = 200
    const byId = Object.fromEntries(r.rankings.map((x) => [x.playerId, x]));
    expect(byId[host.playerId]!.score).toBe(100);
    expect(byId[players[1]!.playerId]!.score).toBe(200);
    expect(byId[host.playerId]!.rank).toBe(3);
    expect(r.rankings[0]!.rank).toBe(1);
    expect(r.winnerIds.sort()).toEqual([players[1]!.playerId, players[2]!.playerId].sort());
    // every client agrees
    for (const p of players) expect(p.results!.matchId).toBe(r.matchId);

    await host.until((b) => b.party!.phase === 'results', 3000, 'party results phase');
    expect(host.party!.players.map((p) => p.id).sort()).toEqual(memberIds); // membership intact
    expect(host.party!.lastResults!.matchId).toBe(r.matchId);
    const pts = Object.fromEntries(host.party!.players.map((p) => [p.id, p.points]));
    expect(pts[players[1]!.playerId]).toBeGreaterThan(pts[host.playerId]!);

    host.send('backToLobby');
    await host.until((b) => b.party!.phase === 'lobby', 3000, 'back to lobby');
    expect(host.party!.players.map((p) => p.id).sort()).toEqual(memberIds);
    expect(host.party!.players.every((p) => p.id === host.playerId || !p.ready)).toBe(true);
    expect(host.party!.matchesPlayed).toBe(1);
    expect(host.party!.players.find((p) => p.id === players[1]!.playerId)!.points).toBeGreaterThan(0); // party points persist
  });

  it('rematches, then switches to another game within the same party', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    const code = host.party!.code;
    await startGame(host, 'majority-trap');
    await Promise.all(players.map((p) => p.until((b) => !!b.gameState, 5000, 'start')));
    await playMajorityTrap(players);
    await host.until((b) => b.party!.phase === 'results', 10000, 'results 1');
    const firstMatch = host.results!.matchId;

    // rematch: same game, same party, fresh match id
    for (const p of players) p.results = null;
    host.send('rematch');
    await host.until((b) => b.party!.phase === 'starting', 3000, 'rematch starting');
    await Promise.all(players.map((p) => p.until((b) => b.gameStart?.gameId === 'majority-trap' && !!b.gameState && b.gameStart!.matchId !== firstMatch, 5000, 'rematch start')));
    await playMajorityTrap(players);
    await host.until((b) => b.party!.phase === 'results' && b.party!.matchesPlayed === 2, 10000, 'results 2');
    expect(host.party!.code).toBe(code);

    // switch game: orbit-swap (2-8 players)
    for (const p of players) p.results = null;
    host.send('selectGame', { gameId: 'orbit-swap' });
    await host.until((b) => b.party!.selectedGameId === 'orbit-swap');
    host.send('start');
    await Promise.all(players.map((p) => p.until((b) => b.gameStart?.gameId === 'orbit-swap' && !!b.gameState, 5000, 'orbit start')));
    await host.until((b) => b.party!.phase === 'playing', 3000, 'playing');
    await Promise.all(players.map((p) => p.until((b) => !!b.results, 10000, 'orbit results')));
    expect(host.results!.gameId).toBe('orbit-swap');
    expect(host.party!.code).toBe(code);
    expect(host.party!.players).toHaveLength(3);
    expect(host.party!.matchesPlayed).toBe(3);
  });

  it('streams authoritative Orbit Swap snapshots and ignores forged state', async () => {
    const players = track(await makeParty(srv.url, 2));
    const host = players[0]!;
    await startGame(host, 'orbit-swap');
    await Promise.all(players.map((p) => p.until((b) => b.eventsOf('snap').length > 5, 6000, 'snapshots')));
    const snap = players[1]!.eventsOf('snap').at(-1)!;
    expect(snap.p).toHaveLength(2);
    expect(snap.p[0]).toHaveLength(6);
    // forged position/score attempts have no effect (action vocabulary is swap/flip only)
    players[1]!.send('g:action', { type: 'setScore', value: 99999 });
    players[1]!.send('g:action', { type: 'move', angle: 0, lane: 0 });
    await Promise.all(players.map((p) => p.until((b) => !!b.results, 10000, 'orbit end')));
    for (const r of host.results!.rankings) expect(r.score).toBeLessThan(500);
  });

  it('plays Echo Steps through the party and eliminates players who never answer', async () => {
    const players = track(await makeParty(srv.url, 2));
    const host = players[0]!;
    await startGame(host, 'echo-steps');
    // Follow the sequence perfectly with p1 only; p0 idles and gets eliminated.
    const p1 = players[1]!;
    const deadline = Date.now() + 15000;
    let sent = -1;
    while (Date.now() < deadline && !p1.results) {
      const s = p1.gameState;
      if (s?.phase === 'watch' && s.sequence) (p1 as any)._seq = s.sequence;
      if (s?.phase === 'input' && sent !== s.round && (p1 as any)._seq) {
        sent = s.round;
        for (const pad of (p1 as any)._seq) p1.send('g:action', { type: 'pad', pad });
      }
      await sleep(20);
    }
    await host.until((b) => !!b.results, 5000, 'echo results');
    const r = host.results!;
    const mine = r.rankings.find((x) => x.playerId === p1.playerId)!;
    const idle = r.rankings.find((x) => x.playerId === host.playerId)!;
    expect(mine.rank).toBe(1);
    expect(mine.score).toBeGreaterThan(idle.score);
    expect(idle.score).toBe(0);
  });

  it('keeps the match and party identity when a player reconnects mid-game', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    const victim = players[2]!;
    const code = host.party!.code;
    await startGame(host, 'majority-trap');
    await Promise.all(players.map((p) => p.until((b) => !!b.gameState, 5000, 'start')));
    const id = victim.playerId;
    const matchId = victim.gameStart!.matchId;
    victim.drop();
    await host.until((b) => b.party!.players.find((x) => x.id === id)?.connected === false, 4000, 'victim offline');
    victim.gameState = null;
    victim.gameStart = null;
    await victim.rejoin(code);
    await victim.until((b) => !!b.gameState && b.gameStart?.matchId === matchId, 4000, 'game resync after reconnect');
    expect(victim.playerId).toBe(id);
    expect(victim.gameStart!.participantIds).toContain(id);
    // and they can still play
    await victim.until((b) => b.gameState.phase === 'question', 4000, 'question phase');
    victim.send('g:action', { type: 'answer', answer: 'A', predict: 'B' });
    await victim.until((b) => !!b.gameState.mine, 3000, 'answer recorded');
  });

  it('lets late joiners spectate without being able to act or see private data', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    await startGame(host, 'majority-trap');
    await Promise.all(players.map((p) => p.until((b) => b.gameState?.phase === 'question', 5000, 'question')));
    players[1]!.send('g:action', { type: 'answer', answer: 'B', predict: 'A' });
    const late = (await new Bot(srv.url, 'Late').join(host.party!.code));
    track([late]);
    await late.until((b) => !!b.gameState, 4000, 'spectator state');
    expect(late.party!.players.find((p) => p.id === late.playerId)!.inGame).toBe(false);
    expect(late.gameState.mine).toBeNull();
    expect(JSON.stringify(late.gameState)).not.toMatch(/"predict":"A"/); // others' secret picks hidden
    late.send('g:action', { type: 'answer', answer: 'A', predict: 'B' });
    await sleep(150);
    expect(late.gameState.submitted).not.toContain(late.playerId);
  });

  it('host can abort a running match back to the lobby', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    await startGame(host, 'majority-trap');
    await host.until((b) => b.party!.phase === 'playing', 4000, 'playing');
    host.send('backToLobby');
    await host.until((b) => b.party!.phase === 'lobby', 3000, 'lobby after abort');
    expect(host.results).toBeNull();
    expect(host.party!.players).toHaveLength(3);
  });

  it('lets the host pick a different game from the results screen', async () => {
    const players = track(await makeParty(srv.url, 3));
    const host = players[0]!;
    await startGame(host, 'majority-trap');
    await playMajorityTrap(players);
    await host.until((b) => b.party!.phase === 'results', 10000, 'results');
    host.send('selectGame', { gameId: 'echo-steps' });
    await host.until((b) => b.party!.selectedGameId === 'echo-steps');
    expect(host.party!.phase).toBe('results');
  });
});
