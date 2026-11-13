# Ubuntu VM deployment

Target: `traz-vm` - Ubuntu 24.04.5 LTS, 6 vCPU, ~8 GB RAM, Docker Engine already installed
(do **not** reinstall it). LAN `10.10.42.88`, Tailscale `100.79.46.21`.

> **Nothing here has been executed on the VM.** These steps are prepared and must be reviewed and
> approved by you before running. Never run anything that changes firewall or DNS without
> reading [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) first. Keep your current SSH session open
> while changing anything network-related.

## Architecture on the VM

`server` (Node, non-root, read-only FS, no capabilities) + `postgres` (private network only) +
`backup` sidecar, all in one compose project `minigamehub`, isolated from unrelated containers
(own network and volumes). The existing Nginx server terminates TLS and proxies
`backend.opop.eu.org` -> `10.10.42.88:2567`.

## 0. Inspect first (read-only)

```bash
ssh <your-user>@100.79.46.21        # over Tailscale
ls -la /home/mini-game              # inspect; do not overwrite anything there
docker ps -a; docker volume ls      # see what already exists
ss -tlnp                            # what listens where (is 2567 free?)
df -h /; free -h
```

## 1. Directory and user

Use a dedicated directory and a non-root account with docker access:

```bash
sudo mkdir -p /opt/minigamehub/backups
sudo chown -R $USER:$USER /opt/minigamehub
cd /opt/minigamehub
git clone https://github.com/trazhub/Mini-Games.git app     # or copy the repo here
cd app
```

Do not add the user to the `docker` group if you prefer `sudo docker ...`; either way, never expose
the Docker socket to the network.

## 2. Configure

```bash
cp .env.example .env
nano .env     # set: NODE_ENV=production, SESSION_SECRET, POSTGRES_PASSWORD, ALLOWED_ORIGINS,
              #      SERVER_BIND=10.10.42.88, TRUST_PROXY handled by compose, METRICS_TOKEN (optional)
chmod 600 .env
# generate secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # POSTGRES_PASSWORD
```

Required values: `SESSION_SECRET` (>= 32 chars), `POSTGRES_PASSWORD`, `ALLOWED_ORIGINS=https://trazhub.github.io`.
Compose refuses to start without them. Secrets are never committed (`.env` is git-ignored).

## 3. Validate and start

```bash
docker compose --env-file .env -f infra/docker/compose.prod.yml config > /dev/null && echo "compose OK"
docker compose --env-file .env -f infra/docker/compose.prod.yml up -d --build
docker compose --env-file .env -f infra/docker/compose.prod.yml ps
curl -s http://10.10.42.88:2567/health          # {"ok":true,"db":"up"}
sh infra/scripts/status.sh
```

Migrations are applied automatically on server start (`apps/server/drizzle`). Logs:
`docker compose ... logs -f server`. Docker rotates logs (10 MB x 3 per container).

## 4. Restrict who can reach port 2567

Docker-published ports bypass UFW, so UFW rules alone do not protect them. The compose file binds
the port to `SERVER_BIND` (the LAN address, never `0.0.0.0`). To also allow only your Nginx
host, add a `DOCKER-USER` rule (replace `NGINX_IP`; review before applying - this edits the host
firewall):

```bash
sudo iptables -I DOCKER-USER -p tcp --dport 2567 ! -s NGINX_IP -j DROP
sudo iptables -I DOCKER-USER -i lo -j ACCEPT      # keep local health checks working
# persist with your distro's mechanism (e.g. iptables-persistent / a systemd unit)
```

PostgreSQL has no published port at all. SSH (22) should stay restricted to Tailscale/trusted
sources. UFW was inactive at last inspection; if you enable it, allow SSH from Tailscale
*first*, keep the existing session open, and test a second login before disconnecting.

## 5. Nginx (existing proxy server)

Copy `infra/nginx/backend.opop.eu.org.conf` to `sites-available`, `infra/nginx/mgh_proxy_params.conf`
to `/etc/nginx/snippets/`, adjust the certificate paths, then `sudo nginx -t && sudo systemctl reload nginx`.
See [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) for DNS and the verification sequence
(HTTP, HTTPS, real WebSocket).

## 6. Operations

| Task | Command |
| --- | --- |
| Status/resources | `sh infra/scripts/status.sh` |
| Logs | `docker compose --env-file .env -f infra/docker/compose.prod.yml logs -f --tail=200 server` |
| Restart server | `... restart server` (players are told; rooms reconnect-grace applies) |
| Graceful stop | `... stop server` (SIGTERM, 30 s grace) |
| Backup now / restore | [BACKUP_RESTORE.md](BACKUP_RESTORE.md) |
| Metrics | `curl -s http://127.0.0.1:2567/metrics` on the VM (loopback only) |

## Update and rollback

```bash
git fetch && git log --oneline HEAD..origin/main        # review incoming changes
docker tag minigamehub-server:latest minigamehub-server:previous    # keep the old image
git pull --ff-only
docker compose --env-file .env -f infra/docker/compose.prod.yml up -d --build
curl -s http://10.10.42.88:2567/health
```

Rollback: `docker tag minigamehub-server:previous minigamehub-server:latest` and
`docker compose ... up -d --no-build server`, or `git checkout <previous-commit>` and rebuild. Take a
manual backup before any release that includes a new migration (migrations only move forward;
undo by restoring the backup). Active parties end when the server restarts; this is a single
instance by design.

## Resource expectations

The compose limits are conservative (server 4 CPU / 2 GB, postgres 2 CPU / 1 GB). Measured numbers
and the load-test method are in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md); no player
capacity is promised without measuring on this VM.
