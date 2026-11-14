# Nginx reverse proxy (for the server administrator)

The public Nginx is **managed separately** from the game VM. Nothing in this repo installs, edits or
restarts it, and no Caddy or other proxy runs on the VM. This page is the hand-off for whoever
administers that Nginx.

```
Internet --HTTPS/WSS 443--> existing Nginx --HTTP/WS--> 10.10.15.254:2567 (Colyseus, Docker)
```

| Item | Value |
|------|-------|
| Public name | `backend.opop.eu.org` |
| Upstream | `http://10.10.15.254:2567` (VM `<vm-host>`, static IP, `/16`) |
| Allowed browser origin | `https://trazhub.github.io` (origins carry no path) |
| Frontend | `https://trazhub.github.io/Mini-Games/` |

The old VM address `<old-vm-ip>` is obsolete and must not appear in any proxy configuration.

## Quick path (script, run on the Nginx host)

Copy the `infra/nginx/` folder to the proxy host, then:

```bash
sudo ./install-proxy-host.sh http     # checks the VM is reachable, adds an HTTP-only proxy, nginx -t, reload
curl -s http://backend.opop.eu.org/health
sudo certbot certonly --webroot -w /var/www/html -d backend.opop.eu.org
sudo ./install-proxy-host.sh tls      # swaps in the final HTTPS config, nginx -t, reload
curl -s https://backend.opop.eu.org/health
```

The script only adds `backend.opop.eu.org.conf` and `snippets/mgh_proxy_params.conf`, backs up any
existing copy, and restores it automatically if `nginx -t` fails. Both stages were syntax-checked with
`nginx -t` (Nginx 1.2x container). They have not been run on your actual proxy host.

## Files to install (manual alternative)

| Repo file | Install as |
|-----------|------------|
| `infra/nginx/mgh_proxy_params.conf` | `/etc/nginx/snippets/mgh_proxy_params.conf` |
| `infra/nginx/backend.opop.eu.org.conf` | `/etc/nginx/sites-available/backend.opop.eu.org.conf` (symlink into `sites-enabled/`) |

```bash
sudo cp mgh_proxy_params.conf /etc/nginx/snippets/
sudo cp backend.opop.eu.org.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/backend.opop.eu.org.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx     # reload only if -t passes
```

Existing sites are untouched: the new file only adds a `server_name backend.opop.eu.org` block plus
three uniquely prefixed (`mgh_*`) zones/upstream/map. If the host already defines a
`$connection_upgrade` map you may drop the `map` block and reuse yours.

## First-time certificate (read before enabling)

The 443 block references `/etc/letsencrypt/live/backend.opop.eu.org/`, which does not exist until a
certificate is issued, so `nginx -t` fails if you enable the file as-is. On 2026-11-13 the host served
a certificate for `opop.eu.org` only (SAN `opop.eu.org`), so `https://backend.opop.eu.org` failed with a
name mismatch and fell through to another site. Either:

- issue a certificate that covers `backend.opop.eu.org` first (the port-80 block already serves
  `/.well-known/acme-challenge/` for HTTP-01), then enable the 443 block; or
- if a wildcard or multi-name certificate is already managed on the host, point the two `ssl_certificate*`
  lines at it instead.

Confirm with: `openssl s_client -connect backend.opop.eu.org:443 -servername backend.opop.eu.org </dev/null | openssl x509 -noout -subject -ext subjectAltName`
(the SAN list must include `backend.opop.eu.org`).

## Requirements the config satisfies

- **TLS**: port 443 with a valid certificate for `backend.opop.eu.org`. Edit the two
  `ssl_certificate*` paths to match how certificates are issued on that host.
- **WebSocket**: `proxy_http_version 1.1`, `Upgrade` and `Connection` headers forwarded (the
  `Connection` value is derived from the client's `Upgrade` header).
- **Timeouts**: `proxy_read_timeout`/`proxy_send_timeout` 3600s (the game server pings every 5 s);
  `proxy_connect_timeout` 5s; `proxy_buffering off`.
- **Client IP**: `X-Forwarded-For` is **overwritten** with `$remote_addr`, never appended. The server
  runs with `TRUST_PROXY=true` and uses it for per-IP rate limits, so a client-supplied value must not
  survive.
- **Metrics**: `/metrics` returns 404 publicly.
- **Rate limits**: per-IP request and connection budgets in front of the application's own limits.

## CORS and origins

The backend only accepts browser origin `https://trazhub.github.io`, set by `ALLOWED_ORIGINS` in the
VM `.env`. Do **not** add `Access-Control-Allow-Origin` headers in Nginx: the application sets them
itself, and duplicating or wildcarding them would weaken the check. WebSocket handshakes are
origin-checked by the application too.

## Network access to the VM

Nginx must reach `10.10.15.254:2567` over the LAN. Because Docker publishes the port directly,
host firewalls such as UFW do **not** filter it. Restrict the source to the Nginx host at a
network-level control (preferably the upstream Proxmox firewall) or with the `DOCKER-USER` rule in
[VM_DEPLOYMENT.md](VM_DEPLOYMENT.md). PostgreSQL (5432) is never published.

## Verification checklist (run in this order)

None of these has been verified yet; the backend is not deployed.

1. DNS: `dig +short backend.opop.eu.org` returns the Nginx host's public address.
2. Nginx to VM: from the Nginx host, `curl -s http://10.10.15.254:2567/health` returns
   `{"ok":true,"db":"up"}`.
3. HTTPS: `curl -sI https://backend.opop.eu.org/health` returns `200` with a valid certificate.
4. WebSocket: from `https://trazhub.github.io/Mini-Games/`, create a room and confirm the lobby opens
   (browser devtools, Network, WS, shows `101 Switching Protocols`). `scripts/loadtest.ts` can also be
   pointed at the public URL.
5. Origin policy: `curl -sI -H 'Origin: https://evil.example' https://backend.opop.eu.org/health`
   must not return that origin in `Access-Control-Allow-Origin`.
6. Metrics: `curl -s -o /dev/null -w '%{http_code}' https://backend.opop.eu.org/metrics` returns `404`.

Only after all six pass should the deployment be described as working.

## Alternative

If the Nginx host cannot reach the VM directly, see [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).
That is a fallback only and is off by default.
