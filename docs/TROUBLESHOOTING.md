# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Cannot reach the game server" when creating a room | Backend not running, wrong `VITE_API_URL`, or CORS | Check `http://localhost:2567/health`. Open the browser console: a CORS error means the page origin is not in `ALLOWED_ORIGINS`. For LAN testing set `ALLOWED_ORIGINS=*` (dev only) |
| Create room fails only in the browser, curl works | CORS: the SDK sends `credentials: include` | Make sure the response has `Access-Control-Allow-Credentials: true` and an echoed (not `*`) origin (already handled in `app.ts`; see `origin.test.ts`) |
| Browser console: mixed content / WS blocked | Page is HTTPS (GitHub Pages) but `VITE_API_URL` is `http://` | Build with `VITE_API_URL=https://backend.opop.eu.org` |
| Page loads blank on GitHub Pages, 404s for `/assets/...` | Built without the base path | Build with `VITE_BASE_PATH=/Mini-Games/` (production builds default to it). Check `dist/index.html` references `/Mini-Games/assets/` |
| Blank page on `vite preview` | Preview base mismatch (fixed in `vite.config.ts`) | Open `http://localhost:<port>/Mini-Games/` (note the path) |
| Port 4173/5173/2567 already in use | Another process owns it (e.g. another dev server) | Pick another port: `npm run preview -w @minigamehub/web -- --port 4180`, `PORT=2600` |
| e2e fails immediately with "port already used" | A dev server (note: `tsx watch` respawns children - stop the supervisor too) holds 2567/4180 | Stop `npm run dev`, then rerun `npm run test:e2e` |
| "Session expired - please refresh" | Server restarted with a new dev secret, or the token expired (about 1 year without use; every `POST /api/guest` with a valid token refreshes it) | The client retries automatically once; otherwise reload |
| "Too many attempts" (429) | Per-IP join/guest rate limit | Wait a minute; raise `JOIN_RATE_PER_MIN` / `GUEST_RATE_PER_MIN` for tests or NAT-heavy networks (school/office share one IP) |
| Two tabs kick each other | Same guest id in both tabs | Tabs are separate guests by default (sessionStorage). The same *tab* reopened elsewhere takes over |
| "Needs 3 players" | Majority Trap needs 3-12 connected players | Add players; the lobby shows each game's requirement |
| WebSocket closes after about 60 s behind Nginx | Missing `proxy_read_timeout` / upgrade headers | Use `infra/nginx/mgh_proxy_params.conf` |
| All players share one IP in rate-limit logs | Proxy not forwarding client IP | Nginx must set `X-Forwarded-For $remote_addr`; set `TRUST_PROXY=true` |
| Server refuses to start: `SESSION_SECRET is required in production` | `NODE_ENV=production` without secrets | Set `SESSION_SECRET` (>= 32 chars) and a concrete `ALLOWED_ORIGINS` |
| `Database migrations not found` | Migrations folder missing next to the bundle | The Docker image copies it to `/app/drizzle` (`MIGRATIONS_DIR`) |
| `[db] DATABASE_URL not set` warning | Running without PostgreSQL | Expected in dev; stats/history are just not stored |
| `docker compose config` says a variable is required | `.env` missing `POSTGRES_PASSWORD`/`SESSION_SECRET` | Fill `.env` (copy from `.env.example`) |
| Phones can't reach the dev server | Windows firewall / wrong URL | Use `http://<PC LAN IP>:5173`, allow Node in the firewall, set `ALLOWED_ORIGINS=*` for dev |
| Audio does nothing | Browsers block audio until a gesture; settings off | Click anything once; check Settings -> Sound effects |
| Laggy Orbit Swap | High latency/slow device | Remote players are interpolated ~110 ms; check the latency in the connection badge; try reducing motion |
| Colyseus prints a banner / `pm2` warnings in tests | Colyseus' own startup | Harmless |

## Useful checks

```bash
curl -s http://localhost:2567/health
curl -s http://localhost:2567/metrics            # loopback only: rooms, connections, tick ms, CPU, RSS
docker compose --env-file .env -f infra/docker/compose.prod.yml logs --tail=200 server
```

Client-side: open DevTools -> Console (look for `[party] connect failed`, which logs the original
error) and Network -> WS to inspect frames.
