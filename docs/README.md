# Documentation index

Start with the [project README](../README.md). Contributors: see [CONTRIBUTING](../CONTRIBUTING.md).

## Using and building

| Document | What it covers |
| --- | --- |
| [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) | Prerequisites, running the web app and server locally |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Overview of the apps, packages and data flow |
| [GAME_ENGINE.md](GAME_ENGINE.md) | The game plugin interface (`@minigamehub/game-core`) |
| [ADDING_A_GAME.md](ADDING_A_GAME.md) | How to add a mini-game |
| [MULTIPLAYER_PROTOCOL.md](MULTIPLAYER_PROTOCOL.md) | Messages between client and server |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptoms, causes and fixes |
| [ROADMAP.md](ROADMAP.md) | What is done and what is planned |

## Security and legal

| Document | What it covers |
| --- | --- |
| [SECURITY.md](SECURITY.md) | Threat model and the protections in place |
| [LEGAL.md](LEGAL.md) | Originality and trademark rules, NOTICE |
| [../SECURITY.md](../SECURITY.md) | How to report a vulnerability |

## Deployment and operations

| Document | What it covers |
| --- | --- |
| [GITHUB_PAGES.md](GITHUB_PAGES.md) | Hosting the static frontend on GitHub Pages |
| [VM_DEPLOYMENT.md](VM_DEPLOYMENT.md) | Deploying the backend on an Ubuntu VM with Docker |
| [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) | What is known and verified about names and networking |
| [NGINX_PROXY.md](NGINX_PROXY.md) | Hand-off for the administrator of the public Nginx proxy |
| [NGINX_PROXY_PROMPT.md](NGINX_PROXY_PROMPT.md) | Ready-made prompt for setting up that proxy |
| [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) | Fallback if public inbound access is not possible |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | PostgreSQL backup and restore |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | What has and has not been verified |

## Design specs and plans

| Document | What it covers |
| --- | --- |
| [superpowers/specs/2026-11-14-nostalgia-arcade-design.md](superpowers/specs/2026-11-14-nostalgia-arcade-design.md) | Design spec for the nostalgia arcade |
| [superpowers/plans/2026-11-14-foundation-and-open-source.md](superpowers/plans/2026-11-14-foundation-and-open-source.md) | Plan 0: foundation and open-source hygiene |

Placeholders such as `<tailscale-ip>`, `<outbound-ip>`, `<vm-host>`, `<gateway>` and `<old-vm-ip>` in these documents
stand for site-specific values that are deliberately not published.
