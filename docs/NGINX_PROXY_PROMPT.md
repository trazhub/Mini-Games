# Prompt: set up the Nginx reverse proxy for backend.opop.eu.org

> Before pasting this to an agent, substitute the placeholders (`<tailscale-ip>`, `<outbound-ip>`, `<vm-host>`, `<gateway>`, `<old-vm-ip>`, where they appear) with your own values.

Paste everything below the line into an AI agent (or hand it to the admin) that has shell access to
the **existing Nginx proxy host**. Not for the game VM.

---

ROLE
You are a careful Linux/Nginx administrator working on the EXISTING public Nginx reverse proxy host.
Goal: publish the MiniGameHub game backend at https://backend.opop.eu.org (HTTPS + secure WebSocket),
with a Let's Encrypt certificate issued through certbot.

HARD RULES
- Other sites on this Nginx must keep working. Only ADD one site file and one snippet. Do not edit,
  disable or delete any existing site, `nginx.conf`, certificate or certbot renewal config.
- Back up anything you overwrite. Always run `nginx -t` before `systemctl reload nginx`. Use reload,
  never restart. If `nginx -t` fails, restore the backup and stop.
- Do not install another web server or proxy. Do not touch firewall/UFW, SSH, networking or Tailscale.
- Never print private keys or tokens. Report each step's real output; do not claim success you did not
  observe.

BACKEND FACTS (from the source code; verified directly against the running backend)
- Upstream: `http://10.10.15.254:2567` (plain HTTP and WebSocket share this ONE port). Docker on VM
  `<vm-host>`, already running. The old IP `<old-vm-ip>` is obsolete: never use it.
- Public name: `backend.opop.eu.org`. DNS already resolves it to this proxy host (`<outbound-ip>`).
- Only allowed browser origin: `https://trazhub.github.io` (the app enforces it for HTTP and for
  WebSocket upgrades: foreign origin -> 403, allowed origin -> 101). NGINX MUST NOT add, change or strip
  `Origin` or any `Access-Control-*` header, and must NOT answer `OPTIONS` itself: CORS preflights
  (`Authorization` header) must reach the app. The app replies 204 with the correct headers.
- Routes the app serves:
  - `GET  /health` -> `{"ok":true,"db":"up"}` (200; 503 if DB down)
  - `POST /api/guest` (JSON body < 2 KB, returns 201 + session token)
  - `GET  /api/rooms/:code`
  - `GET  /api/me/stats` (needs `Authorization: Bearer ...`; keep that header)
  - `POST /matchmake/...` (Colyseus matchmaking over HTTP)
  - WebSocket upgrades on `/<processId>/<roomId>?...` (Colyseus), i.e. any path with
    `Upgrade: websocket`
  - `GET /metrics`: internal only. Must return 404 to the public (`location = /metrics { return 404; }`).
- Server runs with `TRUST_PROXY=true` and trusts `X-Forwarded-For` for per-IP rate limits. Nginx must
  OVERWRITE it: `proxy_set_header X-Forwarded-For $remote_addr;` (never `$proxy_add_x_forwarded_for`),
  plus `X-Real-IP $remote_addr`, `X-Forwarded-Proto $scheme`, `Host $host`.
- WebSocket needs: `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection` derived from a
  `map $http_upgrade` (upgrade / close), `proxy_buffering off`.
- Timeouts: the server pings every 5 s; sockets are long-lived. Use `proxy_read_timeout 3600s`,
  `proxy_send_timeout 3600s`, `proxy_connect_timeout 5s`.
- Bodies are tiny: `client_max_body_size 4k`.
- Optional: per-IP `limit_req`/`limit_conn` in front of the app (suggested: /api/ 20r/s burst 40,
  /matchmake/ 10r/s burst 20, 40 concurrent connections/IP).

FILES (ready-made; in the repo folder `infra/nginx/`, copy it to this host)
- `mgh_proxy_params.conf` -> `/etc/nginx/snippets/mgh_proxy_params.conf`
- `backend.opop.eu.org.bootstrap.conf` (stage 1, HTTP only) and `backend.opop.eu.org.conf` (stage 2,
  HTTPS) -> `/etc/nginx/sites-available/backend.opop.eu.org.conf`, symlinked into `sites-enabled/`
- `install-proxy-host.sh http|tls` automates the steps below. Read it first, then run it, or do the
  steps by hand. If this host uses `conf.d/` instead of `sites-available/`, adapt paths.

STEPS
1. Preflight (change nothing): `nginx -v`; `nginx -T | grep -n "backend.opop.eu.org\|mgh_"` (confirm no
   clash); `curl -s http://10.10.15.254:2567/health` must print `{"ok":true,"db":"up"}`. If it does not,
   STOP and report: this host cannot reach the VM.
2. Stage 1: `sudo ./install-proxy-host.sh http`. Then `curl -s http://backend.opop.eu.org/health`.
3. Certificate: `sudo certbot certonly --webroot -w /var/www/html -d backend.opop.eu.org`. If this host
   uses a different webroot or a DNS challenge, adapt, and make sure the final SAN list contains
   `backend.opop.eu.org` (the current cert only covers `opop.eu.org`).
4. Stage 2: `sudo ./install-proxy-host.sh tls`. Confirm certbot auto-renewal still works:
   `sudo certbot renew --dry-run`.

ACCEPTANCE TESTS (run and paste real output)
1. `curl -s https://backend.opop.eu.org/health` -> `{"ok":true,"db":"up"}` with a valid certificate.
2. `curl -sI http://backend.opop.eu.org/health` -> 301 to https.
3. `openssl s_client -connect backend.opop.eu.org:443 -servername backend.opop.eu.org </dev/null | openssl x509 -noout -subject -ext subjectAltName` -> SAN includes `backend.opop.eu.org`.
4. CORS allowed: `curl -si -X POST -H "Origin: https://trazhub.github.io" -H "content-type: application/json" -d '{}' https://backend.opop.eu.org/api/guest` -> 201 and `Access-Control-Allow-Origin: https://trazhub.github.io`.
5. CORS denied: same with `Origin: https://evil.example` -> 403, no Allow-Origin header.
6. Preflight: `curl -si -X OPTIONS -H "Origin: https://trazhub.github.io" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization" https://backend.opop.eu.org/api/guest` -> 204 with `Access-Control-Allow-Origin: https://trazhub.github.io`.
7. WebSocket origin gate (allowed): `curl -si -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" -H "Origin: https://trazhub.github.io" https://backend.opop.eu.org/ --max-time 5` -> `101 Switching Protocols`. With `Origin: https://evil.example` -> `403`.
8. `curl -s -o /dev/null -w "%{http_code}" https://backend.opop.eu.org/metrics` -> 404.
9. Other sites on this Nginx still answer exactly as before (spot-check at least `https://opop.eu.org`).

FINAL REPORT
List files created/changed (and backups), commands run, each test's real result, anything that failed or
was skipped. Do not say "working" unless tests 1 to 9 passed.
