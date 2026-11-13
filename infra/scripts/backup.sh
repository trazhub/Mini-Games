#!/bin/sh
# Logical PostgreSQL backup (custom format, compressed) with retention.
# Runs inside the `backup` compose service, or manually:
#   docker compose --env-file .env -f infra/docker/compose.prod.yml exec backup /bin/sh /usr/local/bin/backup.sh
set -eu

DIR="${BACKUP_DIR_IN_CONTAINER:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/minigamehub-$STAMP.dump"
TMP="$FILE.partial"

mkdir -p "$DIR"
# pg_dump reads PGHOST/PGUSER/PGPASSWORD/PGDATABASE from the environment (never from argv).
if pg_dump --format=custom --compress=6 --no-owner --file="$TMP"; then
  mv "$TMP" "$FILE"
  # Verify the archive is readable before trusting it.
  pg_restore --list "$FILE" > /dev/null
  echo "[backup] ok: $FILE ($(du -h "$FILE" | cut -f1))"
else
  rm -f "$TMP"
  echo "[backup] FAILED" >&2
  exit 1
fi

# Retention: delete dumps older than KEEP_DAYS.
find "$DIR" -name 'minigamehub-*.dump' -type f -mtime "+$KEEP_DAYS" -print -delete
