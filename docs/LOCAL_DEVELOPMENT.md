# Local development

Primary platform: Windows (PowerShell). Everything also works on macOS/Linux.

## Prerequisites

- Node.js 22 or newer (`node -v`)
- Git
- Optional: Docker Desktop (or WSL2 + Docker) for a local PostgreSQL. Not required for ordinary
  frontend or gameplay work.
- Optional: Google Chrome (the Playwright config uses it locally so no browser download is needed)

## Install and run

```powershell
npm install
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:2567> (`/health`, `/api/guest`, `/matchmake/...`, WebSocket on the same port)

These ports are development defaults. Change them with `PORT` (server) and `--port` (vite).

The frontend finds the backend through `VITE_API_URL`. When unset in dev it uses
`http://<current hostname>:2567`, so opening the dev site from a phone on your LAN
(`http://192.168.x.x:5173`) also reaches your PC's server. The default `ALLOWED_ORIGINS` covers
`localhost`/`127.0.0.1`; for LAN testing add your origin, e.g.
`$env:ALLOWED_ORIGINS="*"` (allowed in development only - production refuses `*`).

## Testing with several players

Each browser **tab** has its own guest session (stored in `sessionStorage`), so two tabs are two
players. Nickname and avatar are shared per browser (`localStorage`) - change the nickname in the
second tab before joining. Use another browser or a private window if you want fully separate
storage. Copy the invite link from the lobby and open it in the other tab.

Games need 2 players (Echo Steps, Orbit Swap) or 3 (Majority Trap) to start.

## Database

```powershell
docker compose -f infra/docker/compose.dev.yml up -d      # PostgreSQL on 127.0.0.1:5432
$env:DATABASE_URL = "postgres://mgh:mgh_dev_only@127.0.0.1:5432/minigamehub"
npm run db:migrate                                         # applies apps/server/drizzle/*.sql
npm run dev:server                                         # also migrates on startup
```

Changing `apps/server/src/db/schema.ts`? Generate a new migration and commit it:

```powershell
npm run db:generate
```

## Tests

```powershell
npm test                 # unit + multiplayer integration (vitest, real in-process server, real Colyseus clients)
npm run test:e2e         # Playwright: builds the web app, starts the server, drives real browsers
npm run typecheck
npm run lint
npm run verify           # typecheck + lint + test + build
```

Notes:

- Server integration tests start a real Colyseus server on a random port. Colyseus' matchmaker is
  process-global, so each test *file* owns one server.
- `pg-driver.test.ts` starts a real PostgreSQL via the `embedded-postgres` dev dependency;
  `persistence.test.ts` uses PGlite. If embedded PostgreSQL cannot start, the former is skipped
  and reported as skipped.
- e2e starts its own server on 2567 and a static preview under `/Mini-Games/` on 4180, and fails fast if
  those ports are busy (stop `npm run dev` first). It never reuses an existing server, because a dev
  server lacks the e2e origins and the shortened game timings set through `GAME_CONFIG_OVERRIDES`.

## Production build locally

```powershell
npm run build                                  # web -> apps/web/dist, server bundle -> apps/server/dist
cd apps/server; node dist/main.js              # the exact artifact the Docker image runs
npm run preview -w @minigamehub/web -- --port 4180
# open http://localhost:4180/Mini-Games/
```

## Load test

```powershell
$env:JOIN_RATE_PER_MIN=100000; $env:GUEST_RATE_PER_MIN=100000; $env:ALLOWED_ORIGINS="*"
cd apps/server; node dist/main.js     # in one terminal
npx tsx scripts/loadtest.ts --rooms 10 --players 6 --game orbit-swap --seconds 30   # in another
```
