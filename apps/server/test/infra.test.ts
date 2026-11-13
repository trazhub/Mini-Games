import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * Static checks of the deployment artifacts. These do NOT replace `docker compose config` or
 * `nginx -t` on the VM (Docker/Nginx are not available in this dev environment) - they guard the
 * security-relevant decisions from regressing and are listed as such in the readiness checklist.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

type Svc = {
  image?: string;
  ports?: string[];
  read_only?: boolean;
  cap_drop?: string[];
  security_opt?: string[];
  restart?: string;
  healthcheck?: unknown;
  depends_on?: Record<string, { condition: string }>;
  environment?: Record<string, string>;
  logging?: { options?: Record<string, string> };
  profiles?: string[];
  volumes?: string[];
  networks?: string[];
};
const compose = load(read('infra/docker/compose.prod.yml')) as { services: Record<string, Svc>; volumes: Record<string, unknown>; networks: Record<string, unknown> };

describe('docker compose (production)', () => {
  it('defines the expected services and a persistent database volume', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['backup', 'cloudflared', 'postgres', 'server']);
    expect(compose.volumes).toHaveProperty('pgdata');
    expect(compose.services.postgres!.volumes).toContain('pgdata:/var/lib/postgresql/data');
  });

  it('never publishes PostgreSQL and publishes the game port on a specific address only', () => {
    expect(compose.services.postgres!.ports).toBeUndefined();
    const ports = compose.services.server!.ports!;
    expect(ports).toHaveLength(1);
    expect(ports[0]).toMatch(/^\$\{SERVER_BIND:-127\.0\.0\.1\}:2567:2567$/); // never bare/0.0.0.0
    expect(JSON.stringify(compose)).not.toContain('docker.sock');
  });

  it('hardens the app container and keeps restart policies, logging limits and health ordering', () => {
    const s = compose.services.server!;
    expect(s.read_only).toBe(true);
    expect(s.cap_drop).toEqual(['ALL']);
    expect(s.security_opt).toContain('no-new-privileges:true');
    for (const name of ['postgres', 'server', 'backup']) {
      expect(compose.services[name]!.restart).toBe('unless-stopped');
      expect(compose.services[name]!.logging?.options?.['max-size']).toBe('10m');
    }
    expect(compose.services.postgres!.healthcheck).toBeDefined();
    expect(s.depends_on!.postgres!.condition).toBe('service_healthy');
  });

  it('requires secrets from the environment and defaults the CORS origin to the Pages site', () => {
    const env = compose.services.server!.environment!;
    expect(env.SESSION_SECRET).toMatch(/\?set SESSION_SECRET/);
    expect(compose.services.postgres!.environment!.POSTGRES_PASSWORD).toMatch(/\?set POSTGRES_PASSWORD/);
    expect(env.ALLOWED_ORIGINS).toContain('https://trazhub.github.io');
    expect(env.TRUST_PROXY).toBe('true');
    expect(read('infra/docker/compose.prod.yml')).not.toMatch(/PASSWORD:\s*[a-z0-9]{6,}\s*$/im);
  });

  it('does not start a second reverse proxy, and keeps the tunnel opt-in', () => {
    expect(Object.keys(compose.services)).not.toContain('caddy');
    expect(compose.services.cloudflared!.profiles).toEqual(['tunnel']);
  });
});

describe('dockerfile', () => {
  const df = read('infra/docker/Dockerfile');
  it('runs as non-root with a healthcheck and graceful stop signal', () => {
    expect(df).toMatch(/^USER node$/m);
    expect(df).toMatch(/HEALTHCHECK/);
    expect(df).toMatch(/STOPSIGNAL SIGTERM/);
    expect(df).toMatch(/NODE_ENV=production/);
  });
});

describe('nginx reverse proxy config', () => {
  const site = read('infra/nginx/backend.opop.eu.org.conf');
  const params = read('infra/nginx/mgh_proxy_params.conf');
  it('forwards backend.opop.eu.org to the VM on 2567 over HTTPS', () => {
    expect(site).toMatch(/server_name backend\.opop\.eu\.org;/);
    expect(site).toMatch(/server 10\.10\.15\.254:2567;/);
    expect(site).toMatch(/listen 443 ssl;/);
    expect(site).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
  });
  it('supports secure WebSocket upgrades with long timeouts', () => {
    expect(params).toMatch(/proxy_set_header Upgrade \$http_upgrade;/);
    expect(params).toMatch(/proxy_set_header Connection \$mgh_connection_upgrade;/);
    expect(params).toMatch(/proxy_http_version 1\.1;/);
    expect(params).toMatch(/proxy_read_timeout 3600s;/);
    expect(site).toMatch(/map \$http_upgrade \$mgh_connection_upgrade/);
  });
  it('overwrites X-Forwarded-For (anti-spoofing) and hides /metrics', () => {
    expect(params).toMatch(/proxy_set_header X-Forwarded-For \$remote_addr;/);
    expect(params).not.toMatch(/\$proxy_add_x_forwarded_for/);
    expect(site).toMatch(/location = \/metrics \{ return 404; \}/);
  });
});

describe('github pages workflow', () => {
  const wf = load(read('.github/workflows/deploy-pages.yml')) as {
    permissions: Record<string, string>;
    env: Record<string, string>;
    jobs: Record<string, { steps?: { uses?: string; with?: { path?: string } }[] }>;
  };
  it('has least-privilege Pages permissions and the verified production URLs', () => {
    expect(wf.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
    expect(wf.env.VITE_BASE_PATH).toBe('/Mini-Games/');
    expect(wf.env.VITE_API_URL).toBe('https://backend.opop.eu.org');
    expect(JSON.stringify(wf.env)).not.toMatch(/SECRET|PASSWORD|TOKEN/i);
  });
  it('publishes apps/web/dist using the official Pages actions', () => {
    const uses = wf.jobs.build!.steps!.map((s) => s.uses).filter(Boolean);
    expect(uses).toEqual(expect.arrayContaining(['actions/checkout@v4', 'actions/setup-node@v4', 'actions/configure-pages@v5', 'actions/upload-pages-artifact@v3']));
    expect(wf.jobs.build!.steps!.find((s) => s.uses?.startsWith('actions/upload-pages-artifact'))!.with!.path).toBe('apps/web/dist');
    expect(wf.jobs.deploy!.steps!.some((s) => s.uses === 'actions/deploy-pages@v4')).toBe(true);
  });
});

describe('.env.example', () => {
  const env = read('.env.example');
  it('contains no real secrets', () => {
    for (const key of ['SESSION_SECRET', 'POSTGRES_PASSWORD', 'METRICS_TOKEN', 'CLOUDFLARE_TUNNEL_TOKEN']) {
      expect(env).toMatch(new RegExp(`^${key}=$`, 'm'));
    }
  });
});
