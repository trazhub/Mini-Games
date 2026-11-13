import type { IncomingMessage } from 'node:http';
import { defineRoom, defineServer, matchMaker, type Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { GamePlugin } from '@minigamehub/game-core';
import {
  LIMITS,
  PARTY_ROOM_NAME,
  guestRequestSchema,
  normalizeRoomCode,
  type GuestResponse,
  type RoomInfoResponse,
} from '@minigamehub/shared';
import express, { type NextFunction, type Request, type Response } from 'express';
import { isOriginAllowed, type ServerConfig } from './config';
import { noopRepository, type Repository } from './db/repository';
import { ALL_GAMES, buildGameMap } from './games';
import { Metrics } from './metrics';
import { KeyedWindowLimiter } from './ratelimit';
import { PartyRoom } from './rooms/PartyRoom';
import { setRuntime, type Runtime, type Timing } from './runtime';
import { issueGuestSession, verifySession } from './session';

export interface CreateServerOptions {
  config: ServerConfig;
  repo?: Repository;
  games?: readonly GamePlugin[];
  /** Override timing (tests). */
  timing?: Partial<Timing>;
  /** Per-game config overrides (tests / ops). */
  gameConfig?: Record<string, Record<string, unknown>>;
}

export interface GameServer {
  server: Server;
  runtime: Runtime;
  /** Resolves with the actual port (supports port 0). */
  listen(port?: number, host?: string): Promise<number>;
  shutdown(): Promise<void>;
}

const CORS_ALLOW_HEADERS = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';

export function createGameServer(opts: CreateServerOptions): GameServer {
  const { config } = opts;
  const repo = opts.repo ?? noopRepository;
  const metrics = new Metrics();
  const runtime: Runtime = {
    config,
    repo,
    games: buildGameMap(opts.games ?? ALL_GAMES),
    timing: {
      startDelayMs: config.START_DELAY_MS,
      graceMs: config.RECONNECT_GRACE_MS,
      hostMigrationMs: config.HOST_MIGRATION_DELAY_MS,
      idleTtlMs: config.ROOM_IDLE_TTL_MS,
      maxLifetimeMs: config.ROOM_MAX_LIFETIME_MS,
      resultsAutoReturnMs: config.RESULTS_AUTO_RETURN_MS,
      unclaimedTtlMs: 30_000,
      ...opts.timing,
    },
    gameConfig: opts.gameConfig ?? config.gameConfigOverrides,
    joinLimiter: new KeyedWindowLimiter(config.JOIN_RATE_PER_MIN, 60_000),
    metrics,
    codes: new Set(),
    rooms: new Set(),
  };
  setRuntime(runtime);

  const guestLimiter = new KeyedWindowLimiter(config.GUEST_RATE_PER_MIN, 60_000);
  const lookupLimiter = new KeyedWindowLimiter(60, 60_000);
  const sessionTtlMs = config.SESSION_TTL_HOURS * 3600_000;

  // CORS for Colyseus' own matchmaking endpoints (/matchmake/*). Colyseus merges
  // DEFAULT_CORS_HEADERS (which contains `Access-Control-Allow-Origin: *`) UNDER getCorsHeaders,
  // so the defaults must be emptied or the wildcard leaks through for disallowed origins.
  matchMaker.controller.DEFAULT_CORS_HEADERS = {} as typeof matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = (headers: Headers) => {
    const origin = headers.get('origin');
    const out: Record<string, string> = {
      'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
    if (origin && isOriginAllowed(config, origin)) {
      out['Access-Control-Allow-Origin'] = origin;
      // The Colyseus SDK issues matchmaking fetches with credentials: "include"; browsers then
      // require this header AND a non-wildcard origin (we echo only allow-listed origins).
      out['Access-Control-Allow-Credentials'] = 'true';
    }
    return out;
  };

  const transport = new WebSocketTransport({
    maxPayload: LIMITS.MAX_MESSAGE_BYTES,
    pingInterval: 5000,
    pingMaxRetries: 3,
    perMessageDeflate: false,
    beforeUpgrade: (request) => {
      const origin = request.headers.get('origin');
      if (!isOriginAllowed(config, origin)) return new Response('Origin not allowed', { status: 403 });
      return undefined;
    },
  });

  const server = defineServer({
    transport,
    rooms: { [PARTY_ROOM_NAME]: defineRoom(PartyRoom) },
    express: (app) => {
      app.disable('x-powered-by');
      if (config.TRUST_PROXY) app.set('trust proxy', true);
      app.use(corsMiddleware(config));
      app.use(express.json({ limit: '2kb' }));

      app.get('/health', async (_req, res) => {
        const dbOk = await repo.ping();
        res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: repo.enabled ? (dbOk ? 'up' : 'down') : 'disabled' });
      });

      app.post('/api/guest', (req, res) => {
        if (!guestLimiter.allow(clientIp(req))) return void res.status(429).json({ error: 'rate_limited' });
        const parsed = guestRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) return void res.status(400).json({ error: 'bad_request' });
        const session = issueGuestSession(config.sessionSecret, sessionTtlMs);
        void repo.upsertGuest(session.guestId).catch((e) => console.error('[db] upsertGuest failed', e?.message ?? e));
        const body: GuestResponse = session;
        res.status(201).json(body);
      });

      app.get('/api/rooms/:code', (req, res) => {
        if (!lookupLimiter.allow(clientIp(req))) return void res.status(429).json({ error: 'rate_limited' });
        const code = normalizeRoomCode(req.params.code);
        if (!code) return void res.status(400).json({ error: 'invalid_code' });
        const handle = [...runtime.rooms].find((r) => r.stats().code === code);
        const info: RoomInfoResponse = { code, exists: !!handle };
        if (handle) {
          const s = handle.stats();
          info.players = s.members;
          info.capacity = LIMITS.PARTY_MAX_PLAYERS;
          info.phase = s.phase;
          info.joinable = s.members < LIMITS.PARTY_MAX_PLAYERS;
        }
        res.json(info);
      });

      app.get('/api/me/stats', async (req, res) => {
        const token = /^Bearer (.+)$/.exec(req.header('authorization') ?? '')?.[1];
        const claims = verifySession(config.sessionSecret, token);
        if (!claims) return void res.status(401).json({ error: 'unauthorized' });
        try {
          res.json({ persisted: repo.enabled, stats: await repo.getStats(claims.sub) });
        } catch {
          res.status(503).json({ error: 'unavailable' });
        }
      });

      app.get('/metrics', (req, res) => {
        const auth = req.header('authorization');
        const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        const hasProxyHeader = !!req.header('x-forwarded-for');
        const tokenOk = !!config.METRICS_TOKEN && auth === `Bearer ${config.METRICS_TOKEN}`;
        if (!tokenOk && !(loopback && !hasProxyHeader && !config.METRICS_TOKEN)) {
          return void res.status(404).end();
        }
        let players = 0;
        let connections = 0;
        let activeGames = 0;
        for (const r of runtime.rooms) {
          const s = r.stats();
          players += s.members;
          connections += s.connected;
          if (s.phase === 'playing') activeGames++;
        }
        res.json(metrics.snapshot({ rooms: runtime.rooms.size, connections, players, activeGames }));
      });

      app.use((_req, res) => void res.status(404).json({ error: 'not_found' }));
      app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
        res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'bad_request' });
      });
    },
  });

  return {
    server,
    runtime,
    async listen(port = config.PORT, host = config.HOST) {
      await server.listen(port, host);
      const addr = (transport as unknown as { server?: { address(): unknown } }).server?.address();
      return typeof addr === 'object' && addr && 'port' in addr ? Number((addr as { port: number }).port) : port;
    },
    async shutdown() {
      await server.gracefullyShutdown(false);
      await repo.close();
    },
  };
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function corsMiddleware(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (origin) {
      if (!isOriginAllowed(config, origin)) {
        if (req.method === 'OPTIONS') return void res.status(403).end();
        return void res.status(403).json({ error: 'origin_not_allowed' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return void res.status(204).end();
    next();
  };
}

export type { IncomingMessage };
