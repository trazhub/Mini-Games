# MiniGameHub

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/trazhub/Mini-Games/actions/workflows/ci.yml/badge.svg)](https://github.com/trazhub/Mini-Games/actions/workflows/ci.yml)
[![Pages](https://github.com/trazhub/Mini-Games/actions/workflows/deploy-pages.yml/badge.svg)](https://trazhub.github.io/Mini-Games/)

A free multiplayer mini-game platform that runs in the browser: friends join a private room with a
5-letter code, play short games together, and stay in the same party between games. No downloads,
no mandatory accounts.

- **Frontend** - Vite, React, TypeScript, Tailwind CSS, Phaser (Orbit Swap), hash routing. Static,
  hosted on GitHub Pages: <https://trazhub.github.io/Mini-Games/>
- **Backend** - Node.js, TypeScript, Colyseus, PostgreSQL (Drizzle ORM), Docker Compose. Public
  endpoint: `https://backend.opop.eu.org`, served behind an existing external Nginx reverse proxy.
- **Status** - the backend is deployed behind that proxy (Docker Compose on a single VM); the
  frontend is a static build published by the Pages workflow. Features on this branch (arcade
  protocol, Lane Runner, daily challenge, recovery codes) are tested locally and ship with the next
  deploy. See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Quickstart

```
git clone https://github.com/trazhub/Mini-Games.git && cd Mini-Games
npm install
npm run dev        # server on :2567, web on :5173
# open http://localhost:5173 in two tabs
npm run verify     # typecheck, lint, tests, build (the CI gate)
```

## The three launch games

| Game | Players | Category | One-liner |
| --- | --- | --- | --- |
| Majority Trap | 3-12 | Party / social | Pick an answer, then predict which one the group picks *less*. |
| Echo Steps | 2-10 | Reaction / memory | Watch the pattern, echo it back; last echo standing wins. |
| Orbit Swap | 2-8 | Arcade | Hop between orbital lanes, grab stars, dodge asteroid arcs (server-authoritative, Phaser). |

All gameplay, timers and scoring are decided on the server. Clients are untrusted.

## Quick start (Windows PowerShell, macOS, Linux)

Requires Node.js 22+. Docker is optional (only for a local PostgreSQL).

```powershell
npm install
npm run dev            # server on :2567 and web on :5173 together
# open http://localhost:5173 in two browser tabs (each tab is its own guest)
```

Separate terminals:

```powershell
npm run dev:server     # http://localhost:2567   (/health to check)
npm run dev:web        # http://localhost:5173
```

Without `DATABASE_URL` the server runs normally but does not persist match history. To persist
locally:

```powershell
docker compose -f infra/docker/compose.dev.yml up -d
$env:DATABASE_URL = "postgres://mgh:mgh_dev_only@127.0.0.1:5432/minigamehub"
npm run db:migrate
npm run dev:server
```

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev (both) / frontend / backend | `npm run dev` / `npm run dev:web` / `npm run dev:server` |
| Typecheck, lint | `npm run typecheck` / `npm run lint` |
| Unit + integration tests | `npm test` |
| End-to-end tests (Playwright, real browsers) | `npm run test:e2e` |
| Production build (web + server bundle) | `npm run build` |
| Preview the production web build | `npm run build:web && npm run preview -- --port 4180` |
| Generate / apply DB migrations | `npm run db:generate` / `npm run db:migrate` |
| Load test | `npx tsx scripts/loadtest.ts --rooms 10 --players 6 --game orbit-swap` |
| Everything CI runs | `npm run verify` |

The production web build uses base path `/Mini-Games/`; `VITE_API_URL` and `VITE_BASE_PATH`
override the backend URL and base path (see [.env.example](.env.example)).

## Repository layout

```
/ README.md  LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  CHANGELOG.md
.github/  workflows/ ISSUE_TEMPLATE/{bug_report,feature_request,new_game}.yml  PULL_REQUEST_TEMPLATE.md
apps/server  apps/web           deployable apps (unchanged layout)
packages/shared  packages/game-core   contracts + engine (game-core gains arcade.ts, arcade-client.ts)
games/<id>/                     one package per game (+ games/lane-runner)
infra/  scripts/  e2e/          deployment, tooling, browser tests
docs/  README.md (index)  LEGAL.md  ...existing guides...  superpowers/{specs,plans}/
```

`apps/web` is the React frontend, `apps/server` the Colyseus server and DB layer, `packages/shared`
the protocol and types, `packages/game-core` the plugin interface, RNG, test harness and the arcade
engine (`arcade.ts`, `arcade-client.ts`), `games/lane-runner` the reference arcade game (server side
and sim), `infra/` the Docker, Nginx and backup files, `scripts/` the load test and the repository
hygiene test. The web pieces of the arcade foundation (Lane Runner's browser UI, the arcade send
plumbing, the recovery card, the Classics shelf) are still to come.

## Documentation

Full index: [docs/README.md](docs/README.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
([Code of Conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md), [Legal notes](docs/LEGAL.md)).
Licensed under the [MIT License](LICENSE).

[Architecture](docs/ARCHITECTURE.md) · [Local development](docs/LOCAL_DEVELOPMENT.md) ·
[Game engine](docs/GAME_ENGINE.md) · [Adding a game](docs/ADDING_A_GAME.md) ·
[Multiplayer protocol](docs/MULTIPLAYER_PROTOCOL.md) · [GitHub Pages](docs/GITHUB_PAGES.md) ·
[VM deployment](docs/VM_DEPLOYMENT.md) · [DNS and networking](docs/DNS_AND_NETWORKING.md) ·
[Cloudflare Tunnel (fallback)](docs/CLOUDFLARE_TUNNEL.md) · [Security](docs/SECURITY.md) ·
[Backup and restore](docs/BACKUP_RESTORE.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) ·
[Roadmap](docs/ROADMAP.md) · [Production readiness](docs/PRODUCTION_READINESS.md)

## Rebranding

The product name is `VITE_APP_NAME` (default `MiniGameHub`); colours and fonts are CSS variables
in `apps/web/src/index.css`.
