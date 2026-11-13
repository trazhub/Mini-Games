# Backup and restore

PostgreSQL holds match history and aggregate stats only (no accounts, no personal data beyond
nicknames in match rows). Active rooms are in memory and are not backed up.

## Automatic backups

The `backup` compose service runs `infra/scripts/backup.sh` every `BACKUP_INTERVAL_SECONDS`
(default 24 h): a compressed custom-format `pg_dump`, verified with `pg_restore --list`, written to
`BACKUP_DIR` (default `/opt/minigamehub/backups`) as `minigamehub-<UTC timestamp>.dump`, keeping
`BACKUP_KEEP_DAYS` (default 14) days. A failed dump leaves no partial file and the container logs `[backup] FAILED`.

Run one now:

```bash
docker compose --env-file .env -f infra/docker/compose.prod.yml exec backup /bin/sh /usr/local/bin/backup.sh
ls -lh /opt/minigamehub/backups
```

Also copy backups **off the VM** (the volume and the backups share a disk). Example from your PC
over Tailscale: `scp <user>@100.79.46.21:/opt/minigamehub/backups/minigamehub-*.dump .`

## Restore (destructive: replaces the database)

Prefer testing the procedure on a scratch copy first.

```bash
cd /opt/minigamehub/app
sh infra/scripts/restore.sh /opt/minigamehub/backups/minigamehub-YYYYMMDDTHHMMSSZ.dump          # prints what it would do
sh infra/scripts/restore.sh /opt/minigamehub/backups/minigamehub-YYYYMMDDTHHMMSSZ.dump --yes    # does it
```

The script verifies the archive, stops the game server, drops and recreates the `minigamehub`
database, loads the dump, and starts the server again. Players are disconnected during the restore.
Afterwards: `curl -s http://127.0.0.1:2567/health`.

Manual equivalent:

```bash
C="docker compose --env-file .env -f infra/docker/compose.prod.yml"
$C stop server
$C exec -T postgres psql -U mgh -d postgres -c "DROP DATABASE IF EXISTS minigamehub WITH (FORCE);" -c "CREATE DATABASE minigamehub OWNER mgh;"
$C exec -T postgres pg_restore -U mgh -d minigamehub --no-owner < backup.dump
$C start server
```

## Disaster recovery on a new VM

1. Install Docker, clone the repo, create `.env` (same `POSTGRES_PASSWORD` is not required;
   `SESSION_SECRET` may change - players just get new sessions).
2. `docker compose ... up -d postgres`
3. Restore with the script above, then `up -d` everything.

## Upgrading PostgreSQL major versions

The image is `postgres:16-alpine`. A major upgrade needs dump + restore into a fresh volume
(`pg_dump` from the old version, `pg_restore` into the new); do not just change the tag.

## What is and is not verified

`pg_dump`/`pg_restore` are standard tools run inside the Postgres image; the scripts are syntax
checked (`sh -n`) here, but **a backup-and-restore round trip has not been executed** because Docker
is not available in the development environment. Do one on the VM and record the result in
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) before relying on backups.
