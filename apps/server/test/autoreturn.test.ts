import { afterAll, describe, expect, it } from 'vitest';
import { makeParty, startTestServer } from './helpers';

const MT = { rounds: 1, introMs: 50, answerMs: 300, revealMs: 100, latencyGraceMs: 50 };

describe('results auto-return', () => {
  let close: (() => Promise<void>) | null = null;
  afterAll(async () => close?.());

  it('returns the party to the lobby when the host does nothing after results', async () => {
    const srv = await startTestServer({
      gameConfig: { 'majority-trap': MT },
      timing: { startDelayMs: 50, resultsAutoReturnMs: 1500 },
    });
    close = srv.close;
    const players = await makeParty(srv.url, 3);
    const host = players[0]!;
    host.send('selectGame', { gameId: 'majority-trap' });
    await host.until((b) => b.party!.selectedGameId === 'majority-trap');
    host.send('start');
    await host.until((b) => b.party!.phase === 'results', 10000, 'results');
    await host.until((b) => b.party!.phase === 'lobby', 6000, 'auto return');
    expect(host.party!.players).toHaveLength(3);
    expect(host.party!.matchesPlayed).toBe(1);
    await Promise.all(players.map((p) => p.close()));
  });
});
