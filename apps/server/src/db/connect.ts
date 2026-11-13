import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createPgRepository, type Repository } from './repository';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locates the SQL migrations: MIGRATIONS_DIR wins; otherwise next to the bundle (dist/drizzle,
 * the Docker layout) or in the source tree (apps/server/drizzle, dev).
 */
export function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const candidates = [path.resolve(here, 'drizzle'), path.resolve(here, '../../drizzle'), path.resolve(process.cwd(), 'drizzle')];
  const found = candidates.find((c) => existsSync(path.join(c, 'meta', '_journal.json')));
  if (!found) throw new Error(`Database migrations not found. Looked in: ${candidates.join(', ')}`);
  return found;
}

export async function connectPostgres(
  url: string,
  opts: { migrationsDir?: string; runMigrations?: boolean } = {},
): Promise<Repository> {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  const db = drizzle(pool);
  if (opts.runMigrations !== false) {
    await migrate(db, { migrationsFolder: opts.migrationsDir ?? migrationsFolder() });
  }
  return createPgRepository(db, () => pool.end());
}
