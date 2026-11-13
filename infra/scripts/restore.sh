#!/bin/sh
# Restore a backup into the running postgres container. DESTRUCTIVE: replaces the database.
#   sh infra/scripts/restore.sh /opt/minigamehub/backups/minigamehub-20260101T000000Z.dump --yes
# Run from the repository root on the VM. The game server is stopped during the restore.
set -eu

DUMP="${1:?usage: restore.sh <dump-file> --yes}"
CONFIRM="${2:-}"
COMPOSE="docker compose --env-file .env -f infra/docker/compose.prod.yml"

[ -f "$DUMP" ] || { echo "dump not found: $DUMP" >&2; exit 1; }
if [ "$CONFIRM" != "--yes" ]; then
  echo "This will DROP and recreate database 'minigamehub' from $DUMP."
  echo "Re-run with --yes to proceed."
  exit 2
fi

echo "[restore] verifying archive"
$COMPOSE exec -T postgres pg_restore --list < "$DUMP" > /dev/null

echo "[restore] stopping server (players will be disconnected)"
$COMPOSE stop server

echo "[restore] recreating database"
$COMPOSE exec -T postgres psql -U mgh -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS minigamehub WITH (FORCE);" \
  -c "CREATE DATABASE minigamehub OWNER mgh;"

echo "[restore] loading data"
$COMPOSE exec -T postgres pg_restore -U mgh -d minigamehub --no-owner --exit-on-error < "$DUMP"

echo "[restore] starting server"
$COMPOSE start server
echo "[restore] done. Check: curl -s http://127.0.0.1:2567/health"
