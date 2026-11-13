#!/bin/sh
# One-shot health/resource snapshot for the VM. Read-only.
set -eu
COMPOSE="docker compose --env-file .env -f infra/docker/compose.prod.yml"
echo "== containers"; $COMPOSE ps
echo; echo "== resource usage"; docker stats --no-stream $($COMPOSE ps -q) 2>/dev/null || true
echo; echo "== health"; curl -fsS http://127.0.0.1:2567/health || echo "health check FAILED"
echo; echo "== game metrics (loopback only)"; curl -fsS http://127.0.0.1:2567/metrics || echo "(metrics need METRICS_TOKEN or loopback)"
echo; echo "== disk"; df -h / | tail -1
echo; echo "== latest backups"; ls -lh "${BACKUP_DIR:-/opt/minigamehub/backups}" 2>/dev/null | tail -3 || true
