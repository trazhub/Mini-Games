/**
 * Load test: N parties of P bots play real matches against a running server and we sample the
 * server's own /metrics (CPU, RSS, tick time, rooms, connections) plus client-side latency and
 * received bandwidth. It reports measurements only - it makes no capacity claims.
 *
 *   npx tsx scripts/loadtest.ts --url http://127.0.0.1:2567 --rooms 10 --players 6 --game orbit-swap --seconds 40
 *
 * The server must allow bots (no browser origin is sent) and should be started with high join
 * rate limits, e.g. JOIN_RATE_PER_MIN=100000 GUEST_RATE_PER_MIN=100000 MAX_ROOMS=1000.
 */
import { Client, type Room } from '@colyseus/sdk';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? 'true']] : acc), []),
);
const URL_ = (args.url as string) ?? 'http://127.0.0.1:2567';
const ROOMS = Number(args.rooms ?? 5);
const PLAYERS = Number(args.players ?? 4);
const GAME = (args.game as string) ?? 'orbit-swap';
const SECONDS = Number(args.seconds ?? 30);
const SAMPLE_MS = 2000;

interface BotStats {
  msgs: number;
  bytes: number;
  rtts: number[];
}
const stats: BotStats = { msgs: 0, bytes: 0, rtts: [] };
let joinFailures = 0;
const joinTimes: number[] = [];

async function guest(): Promise<string> {
  const r = await fetch(`${URL_}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`guest ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

function wire(room: Room, onState: (s: any) => void) {
  for (const t of ['party', 'game:state', 'game:start', 'game:end', 'notice', 'you']) {
    room.onMessage(t, (m: unknown) => {
      stats.msgs++;
      stats.bytes += JSON.stringify(m ?? '').length;
      if (t === 'game:state') onState(m);
    });
  }
  room.onMessage('game:event', (m: any) => {
    stats.msgs++;
    stats.bytes += JSON.stringify(m).length;
  });
  room.onMessage('pong', (m: { t: number }) => stats.rtts.push(Date.now() - m.t));
}

async function runParty(i: number, stop: () => boolean) {
  const bots: Room[] = [];
  try {
    const t0 = Date.now();
    const host = await new Client(URL_).create('party', { token: await guest(), nickname: `Host${i}`, avatar: 'comet' });
    joinTimes.push(Date.now() - t0);
    const code = host.roomId;
    let phase = 'lobby';
    host.onMessage('party', (p: any) => (phase = p.phase));
    wire(host, () => {});
    bots.push(host);
    for (let b = 1; b < PLAYERS; b++) {
      const t1 = Date.now();
      const room = await new Client(URL_).joinById(code, { token: await guest(), nickname: `Bot${i}-${b}`, avatar: 'fox' });
      joinTimes.push(Date.now() - t1);
      const last = 0;
      wire(room, (s) => {
        // Cheap behaviour so the server has real input to validate.
        if (GAME === 'majority-trap' && s?.phase === 'question' && !s.mine) {
          room.send('g:action', { type: 'answer', answer: Math.random() < 0.5 ? 'A' : 'B', predict: Math.random() < 0.5 ? 'A' : 'B' });
        }
        void last;
      });
      if (GAME === 'orbit-swap') {
        const id = setInterval(() => {
          if (Math.random() < 0.7) room.send('g:action', { type: 'swap', d: Math.random() < 0.5 ? 1 : -1 });
          else room.send('g:action', { type: 'flip' });
        }, 250 + Math.random() * 250);
        room.onLeave(() => clearInterval(id));
      }
      room.send('ready', { ready: true });
      bots.push(room);
    }
    const pingId = setInterval(() => bots.forEach((r) => r.send('ping', { t: Date.now() })), 2000);
    host.send('selectGame', { gameId: GAME });
    // Keep starting matches back-to-back until the test ends.
    while (!stop()) {
      if (phase === 'lobby') host.send('start');
      else if (phase === 'results') host.send('rematch');
      await new Promise((r) => setTimeout(r, 700));
    }
    clearInterval(pingId);
  } catch (e) {
    joinFailures++;
    console.error(`party ${i} failed:`, (e as Error).message);
  } finally {
    await Promise.all(bots.map((r) => r.leave(true).catch(() => {})));
  }
}

async function metrics(): Promise<any> {
  try {
    return await (await fetch(`${URL_}/metrics`)).json();
  } catch {
    return null;
  }
}

const pct = (arr: number[], p: number) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]! : 0);

console.log(`Load test: ${ROOMS} parties x ${PLAYERS} bots (${ROOMS * PLAYERS} connections), game=${GAME}, ${SECONDS}s, server=${URL_}`);
const start = Date.now();
let stopFlag = false;
const stop = () => stopFlag;
const samples: any[] = [];
const sampler = setInterval(async () => {
  const m = await metrics();
  if (m) samples.push(m);
}, SAMPLE_MS);
await metrics(); // reset CPU window
const parties = Array.from({ length: ROOMS }, (_, i) => new Promise<void>((r) => setTimeout(() => runParty(i, stop).then(r), i * 60)));
await new Promise((r) => setTimeout(r, SECONDS * 1000));
stopFlag = true;
await Promise.all(parties);
clearInterval(sampler);
const elapsed = (Date.now() - start) / 1000;

const peak = (f: (m: any) => number) => Math.max(0, ...samples.map(f));
const avg = (f: (m: any) => number) => (samples.length ? samples.reduce((a, m) => a + f(m), 0) / samples.length : 0);
const rounded = (n: number) => Math.round(n * 100) / 100;
const report = {
  config: { rooms: ROOMS, playersPerRoom: PLAYERS, game: GAME, seconds: SECONDS },
  server: {
    peakRooms: peak((m) => m.rooms),
    peakConnections: peak((m) => m.connections),
    peakActiveGames: peak((m) => m.activeGames),
    cpuPercentAvg: rounded(avg((m) => m.process.cpuPercentSinceLastSample)),
    cpuPercentPeak: rounded(peak((m) => m.process.cpuPercentSinceLastSample)),
    rssMBPeak: peak((m) => m.process.rssMB),
    heapMBPeak: peak((m) => m.process.heapUsedMB),
    tickAvgMs: rounded(avg((m) => m.tick.windowAvgMs)),
    tickMaxMs: rounded(peak((m) => m.tick.windowMaxMs)),
    matchesFinished: samples.at(-1)?.counters.matchesFinished ?? 0,
    samples: samples.length,
  },
  client: {
    joinMsP50: pct(joinTimes, 50),
    joinMsP95: pct(joinTimes, 95),
    joinFailures,
    pingRttMsP50: pct(stats.rtts, 50),
    pingRttMsP95: pct(stats.rtts, 95),
    messagesPerSecAllBots: rounded(stats.msgs / elapsed),
    downstreamKBps: rounded(stats.bytes / 1024 / elapsed),
    downstreamKBpsPerPlayer: rounded(stats.bytes / 1024 / elapsed / Math.max(1, ROOMS * PLAYERS)),
  },
  note: 'Bot client and server share this machine; CPU/latency include the load generator. Treat as a relative measurement.',
};
console.log(JSON.stringify(report, null, 2));
process.exit(0);
