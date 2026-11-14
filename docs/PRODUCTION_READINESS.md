# Production readiness

Local checks below were last run on 2026-11-13 on the Windows 11 development PC (Node 22, Chrome).
**Live status (2026-11-14):** the backend is deployed (Docker Compose on a single VM, behind an
existing Nginx reverse proxy) and the public path was checked from outside: `/health` reports the
database up, the TLS certificate is valid, http redirects to https, CORS allows only the Pages
origin, a WebSocket upgrade succeeds for the allowed origin and is refused for others, and `/metrics`
is not exposed. A three-player bot join over `wss` had no failures, and a human confirmed play
works. Still **not** verified: a VM reboot test, restricting port 2567 to the proxy host, a full
match through the proxy under load, and every game on real phones. This checklist separates what
was executed from what still needs the VM, the network, or your approval. Do not treat the "not yet
verified" rows as done.

## Verified locally (executed)

| Area | Result |
| --- | --- |
| `npm run typecheck` (all 7 workspaces) | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` (vitest) | 13 files, 101 tests passed (game logic, rooms, security, origin/CORS, persistence, infra static checks) |
| `npm run test:e2e` (Playwright, Chrome desktop + Pixel 7 emulation, production build under `/Mini-Games/`) | 12 / 12 passed |
| `npm run build` | web (static) and server bundle build |
| Bundled server (`apps/server/dist/main.js`, the Docker artifact) | boots, `/health` OK, survived the load tests below |
| Real PostgreSQL via `node-postgres` + migrations (embedded PostgreSQL) | passes (`pg-driver.test.ts`) |
| Real PostgreSQL engine via PGlite (schema, transactions, rollback, stats, server integration) | passes (`persistence.test.ts`) |
| Manual browser run (create, invite link, join, ready, Orbit Swap, results) | worked; found and fixed the CORS credentials bug |

Test coverage against your list: create/join/invalid code/full room/host disconnect and
migration/reconnect/expiration (rooms), start/input/invalid input/scoring/timers/finish/winner/
rematch/switch games/return to lobby (games + matches), forged scores/duplicates/malformed/
unauthorised host/token misuse (security), mobile + desktop layout, keyboard + touch controls,
GitHub Pages base path and static build (e2e), compose/nginx/workflow checks (static, see below).

## Measured performance (local, relative only)

Method: `scripts/loadtest.ts` against the bundled production server on the same Windows PC as the
load generator (so CPU numbers include the bots). Orbit Swap, the heaviest game, bots swapping/flipping at 2-4 Hz.

| Scenario | Connections | CPU (server, avg / peak, % of one core) | RSS peak | Tick avg / max | Downstream per player | Join p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 10 parties x 6 | 60 | 6.6 / 29 | 88 MB | 0.1 ms / 1.2 ms | ~1.6 KB/s | 12 / 32 ms |
| 40 parties x 8 (plus ~10 stale rooms in grace) | 320 | 13.6 / 44.5 | 106 MB | 0.1 ms / 2.2 ms | ~2.1 KB/s | 9 / 28 ms |

Zero join failures. These are **measurements on a different machine, not a capacity claim**. Re-run
on the VM through Nginx (`--url https://backend.opop.eu.org` from a different host) and record real
numbers here before advertising any limit.

## Not yet verified (needs the VM / network / your approval)

| # | Item | How to verify | Status |
| --- | --- | --- | --- |
| 1 | GitHub repo exists, Pages source = "GitHub Actions", workflow runs green | [GITHUB_PAGES.md](GITHUB_PAGES.md) | not done (nothing pushed) |
| 2 | `docker compose config` and `up` on the VM; image builds | [VM_DEPLOYMENT.md](VM_DEPLOYMENT.md) | not run (Docker unavailable locally); static checks only |
| 3 | Dockerfile build (the bundle itself was verified; the image was not) | `docker build` on the VM | not run |
| 4 | `nginx -t` and a reload with `infra/nginx/*` on the proxy host | [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) | not run; static checks only |
| 5 | DNS: `backend.opop.eu.org` resolves to the Nginx host; ports 80/443 reachable from the internet | steps 1, 4, 5 of the sequence | **unknown** |
| 6 | Nginx host can reach `10.10.15.254:2567` | step 2 | unknown |
| 7 | Real browser WebSocket through Nginx (`wss://`) | step 6 + open the Pages site | unknown |
| 8 | CORS from `https://trazhub.github.io` in a real browser | console check | unknown |
| 9 | Backup + restore round trip on the VM | [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | not run |
| 10 | Firewall/`DOCKER-USER` rule applied without lockout | [VM_DEPLOYMENT.md](VM_DEPLOYMENT.md) §4 | not applied; needs explicit approval |
| 11 | Load test against the real VM and proxy | `scripts/loadtest.ts` | not run |
| 12 | Safari/Firefox/real phones | manual | only Chrome and Chrome's Pixel 7 emulation tested |

## Known limitations and risks

- **Single process.** A server restart ends all running parties (players land on "connection lost");
  reconnect-grace does not survive a restart. Scaling out needs Redis presence + sticky routing.
- **Latency model.** Orbit Swap has no client-side prediction of the player's own lane change (it
  appears after one round trip + snapshot interval, about 70-150 ms on a good link).
- **Shared NAT.** Per-IP rate limits (40 joins/min, 30 guest sessions/min) could affect a large
  group on one IP; they are configurable.
- **Moderation** is limited to host removal and nickname sanitisation (no reporting, no profanity
  filter, bans are per party).
- **npm audit** (`--omit=dev`): 9 findings (6 low, 3 moderate) arrive transitively through
  `@colyseus/core` -> `@colyseus/auth` -> `grant` -> `jwk-to-pem` -> `elliptic`, and `uuid` via
  `request-oauth`. This project does not enable Colyseus' auth module, so the vulnerable code paths
  are not reachable; the only fix offered is a breaking downgrade. Re-check after Colyseus updates.
- **Dependencies are new majors** (Vite 8, Phaser 4, Colyseus 0.18, Tailwind 4, React 19, Zod 4). They
  work in the tests above; keep `package-lock.json` committed and update deliberately.
- Browser autoplay rules apply to sound; first interaction unlocks audio.
- `GAME_CONFIG_OVERRIDES` is an ops-only server env; never expose it to clients.

## Go-live checklist (in order, each step needs your go-ahead)

1. [ ] Review `.env` values; generate `SESSION_SECRET`, `POSTGRES_PASSWORD` (never reuse the dev ones).
2. [ ] Push the repo to `trazhub/Mini-Games`; enable Pages (Actions); confirm the workflow is green.
3. [ ] On the VM: inspect `/home/mini-game`, free port 2567, create `/opt/minigamehub`.
4. [ ] `docker compose ... config`, then `up -d --build`; confirm `/health` on `10.10.15.254:2567`.
5. [ ] Nginx: install the site + snippet, `nginx -t`, reload.
6. [ ] DNS: confirm `backend.opop.eu.org` -> Nginx (ask before any DNS change).
7. [ ] Run verification steps 4-6 (HTTP, HTTPS, real WSS) from outside your network.
8. [ ] Open `https://trazhub.github.io/Mini-Games/`, play all three games with real devices.
9. [ ] Run one backup and one restore test; copy a backup off the VM.
10. [ ] Apply the `DOCKER-USER` rule only after reading the lockout warnings; test a fresh SSH login.
11. [ ] Run the load test through the proxy; record numbers above.
12. [ ] Set up monitoring (`status.sh` cron or your existing tooling) and a log check routine.

Rollback at every stage: see [VM_DEPLOYMENT.md](VM_DEPLOYMENT.md) (previous image tag / commit) and
disable the Nginx site to take the backend offline without touching the VM.
