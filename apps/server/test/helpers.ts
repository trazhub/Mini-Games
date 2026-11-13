import { Client, type Room } from '@colyseus/sdk';
import type { GamePlugin } from '@minigamehub/game-core';
import type { GameStartPayload, MatchResults, PartyState } from '@minigamehub/shared';
import { createGameServer, type GameServer } from '../src/app';
import { loadConfig, type ServerConfig } from '../src/config';
import type { Repository } from '../src/db/repository';
import type { Timing } from '../src/runtime';

export interface TestServer {
  app: GameServer;
  port: number;
  url: string;
  config: ServerConfig;
  close(): Promise<void>;
}

export async function startTestServer(
  opts: {
    env?: Record<string, string>;
    timing?: Partial<Timing>;
    gameConfig?: Record<string, Record<string, unknown>>;
    repo?: Repository;
    games?: readonly GamePlugin[];
  } = {},
): Promise<TestServer> {
  const config = loadConfig({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: '*',
    JOIN_RATE_PER_MIN: '1000',
    GUEST_RATE_PER_MIN: '1000',
    ...opts.env,
  } as NodeJS.ProcessEnv);
  const app = createGameServer({
    config,
    repo: opts.repo,
    games: opts.games,
    timing: { startDelayMs: 50, graceMs: 2500, hostMigrationMs: 300, idleTtlMs: 5000, resultsAutoReturnMs: 60000, unclaimedTtlMs: 5000, ...opts.timing },
    gameConfig: opts.gameConfig,
  });
  const port = await app.listen(0, '127.0.0.1');
  return { app, port, url: `http://127.0.0.1:${port}`, config, close: () => app.shutdown() };
}

export async function getGuest(url: string): Promise<{ guestId: string; token: string }> {
  const res = await fetch(`${url}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`guest failed ${res.status}`);
  return (await res.json()) as { guestId: string; token: string };
}

export class Bot {
  room!: Room;
  party: PartyState | null = null;
  gameState: any = null;
  gameStart: GameStartPayload | null = null;
  results: MatchResults | null = null;
  events: { type: string; [k: string]: any }[] = [];
  notices: string[] = [];
  kicked: string | null = null;
  leftCode: number | null = null;
  playerId = '';
  guestId = '';
  token = '';

  constructor(
    readonly url: string,
    readonly nickname: string,
    readonly avatar = 'comet',
  ) {}

  async guest(): Promise<this> {
    const g = await getGuest(this.url);
    this.guestId = g.guestId;
    this.token = g.token;
    return this;
  }

  private attach(room: Room): void {
    this.room = room;
    room.onMessage('party', (p: PartyState) => (this.party = p));
    room.onMessage('you', (m: { playerId: string }) => (this.playerId = m.playerId));
    room.onMessage('game:start', (g: GameStartPayload) => {
      this.gameStart = g;
      this.gameState = null;
      this.events = [];
    });
    room.onMessage('game:state', (s: unknown) => (this.gameState = s));
    room.onMessage('game:event', (e: any) => this.events.push(e));
    room.onMessage('game:end', (r: MatchResults) => (this.results = r));
    room.onMessage('notice', (n: { message: string }) => this.notices.push(n.message));
    room.onMessage('kicked', (k: { reason: string }) => (this.kicked = k.reason));
    room.onLeave((code: number) => (this.leftCode = code));
  }

  private options() {
    return { token: this.token, nickname: this.nickname, avatar: this.avatar };
  }

  async create(): Promise<this> {
    if (!this.token) await this.guest();
    const client = new Client(this.url);
    this.attach(await client.create('party', this.options()));
    await this.until((b) => !!b.party);
    return this;
  }

  async join(code: string): Promise<this> {
    if (!this.token) await this.guest();
    const client = new Client(this.url);
    this.attach(await client.joinById(code, this.options()));
    await this.until((b) => !!b.party);
    return this;
  }

  /** Re-join with the same guest identity (reconnection). */
  async rejoin(code: string): Promise<this> {
    this.leftCode = null;
    const client = new Client(this.url);
    this.attach(await client.joinById(code, this.options()));
    await this.until((b) => !!b.party);
    return this;
  }

  send(type: string, payload?: unknown): void {
    this.room.send(type, payload);
  }

  /** Simulate an abrupt network drop (not a consented leave). */
  drop(): void {
    (this.room.connection as any).close(1000);
  }

  async until(pred: (b: Bot) => boolean, timeoutMs = 8000, label = 'condition'): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (pred(this)) return;
      await sleep(15);
    }
    throw new Error(`Timed out waiting for ${label}; party=${JSON.stringify(this.party)?.slice(0, 400)}`);
  }

  eventsOf(type: string) {
    return this.events.filter((e) => e.type === type);
  }

  me() {
    return this.party?.players.find((p) => p.id === this.playerId);
  }

  async close(): Promise<void> {
    try {
      await this.room?.leave(true);
    } catch {
      /* already closed */
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Create a party with a host and (n-1) joiners. All players except the host get ready. */
export async function makeParty(url: string, n: number, opts: { ready?: boolean } = {}): Promise<Bot[]> {
  const host = await new Bot(url, 'Host').create();
  const code = host.party!.code;
  const bots = [host];
  for (let i = 1; i < n; i++) {
    const b = await new Bot(url, `Player${i}`).join(code);
    bots.push(b);
  }
  await host.until((b) => b.party!.players.length === n, 5000, `${n} players`);
  if (opts.ready !== false) {
    for (const b of bots.slice(1)) b.send('ready', { ready: true });
    await host.until((b) => b.party!.players.every((p) => p.ready), 5000, 'all ready');
  }
  return bots;
}
