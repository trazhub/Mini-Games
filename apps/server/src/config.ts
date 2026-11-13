import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  /** Comma separated list of browser origins allowed to call the API / open WebSockets. "*" = any (dev only). */
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'),
  /** HMAC secret for guest session tokens. REQUIRED in production. */
  SESSION_SECRET: z.string().min(32).optional(),
  /** Guest token lifetime; renewed on every POST /api/guest with a valid token (sliding ~1 year). */
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8760),
  /** postgres://user:pass@host:5432/db - when unset, stats persistence is disabled. */
  DATABASE_URL: z.string().optional(),
  /** Set when running behind a reverse proxy (Caddy / Cloudflare Tunnel) so req.ip uses X-Forwarded-For. */
  TRUST_PROXY: bool.default(false),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(1000).default(60_000),
  HOST_MIGRATION_DELAY_MS: z.coerce.number().int().min(0).default(8_000),
  ROOM_IDLE_TTL_MS: z.coerce.number().int().min(1000).default(120_000),
  ROOM_MAX_LIFETIME_MS: z.coerce.number().int().min(60_000).default(6 * 3600_000),
  START_DELAY_MS: z.coerce.number().int().min(0).default(3_000),
  RESULTS_AUTO_RETURN_MS: z.coerce.number().int().min(1000).default(60_000),
  /** Max new guest sessions per IP per minute. */
  GUEST_RATE_PER_MIN: z.coerce.number().int().min(1).default(30),
  /** Max room join/create attempts per IP per minute. */
  JOIN_RATE_PER_MIN: z.coerce.number().int().min(1).default(40),
  /** Max live rooms on this instance (protects memory). */
  MAX_ROOMS: z.coerce.number().int().min(1).default(500),
  /** Bearer token required for /metrics. Unset => /metrics only answers loopback requests. */
  METRICS_TOKEN: z.string().min(16).optional(),
  /** JSON object { "<gameId>": { ...config } } - ops/test tuning of game durations. Never client-controlled. */
  GAME_CONFIG_OVERRIDES: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ServerConfig = Omit<z.infer<typeof envSchema>, 'ALLOWED_ORIGINS' | 'SESSION_SECRET' | 'GAME_CONFIG_OVERRIDES'> & {
  gameConfigOverrides: Record<string, Record<string, unknown>>;
  allowedOrigins: string[];
  anyOrigin: boolean;
  sessionSecret: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const { ALLOWED_ORIGINS, SESSION_SECRET, GAME_CONFIG_OVERRIDES, ...rest } = parsed.data;
  let gameConfigOverrides: Record<string, Record<string, unknown>> = {};
  if (GAME_CONFIG_OVERRIDES) {
    try {
      gameConfigOverrides = z.record(z.string(), z.record(z.string(), z.unknown())).parse(JSON.parse(GAME_CONFIG_OVERRIDES));
    } catch {
      throw new Error('GAME_CONFIG_OVERRIDES must be a JSON object of objects');
    }
  }
  const allowedOrigins = ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const anyOrigin = allowedOrigins.includes('*');
  if (rest.NODE_ENV === 'production') {
    if (!SESSION_SECRET) throw new Error('SESSION_SECRET is required in production (min 32 chars).');
    if (anyOrigin) throw new Error('ALLOWED_ORIGINS must not contain "*" in production.');
  }
  return {
    ...rest,
    gameConfigOverrides,
    allowedOrigins,
    anyOrigin,
    // In dev/test a random per-process secret is fine; tokens simply expire on restart.
    sessionSecret: SESSION_SECRET ?? randomBytes(32).toString('hex'),
  };
}

export function isOriginAllowed(cfg: Pick<ServerConfig, 'allowedOrigins' | 'anyOrigin'>, origin: string | null | undefined): boolean {
  if (!origin) return true; // non-browser clients send no Origin; browsers always do.
  if (cfg.anyOrigin) return true;
  return cfg.allowedOrigins.includes(origin.replace(/\/$/, ''));
}
