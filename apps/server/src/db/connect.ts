import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createPgRepository, type Repository } from './repository';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the migrations folder in both dev (src/db) and the bundled build (dist/). */
export function migrationsFolder(): string {
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(here, './drizzle')];
  return candidates[0]!;
}

export async function connectPostgres(
  url: string,
  opts: { migrationsDir?: string; runMigrations?: boolean } = {},
): Promise<Repository> {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  const db = drizzle(pool);
  if (opts.runMigrations !== false) {
    await migrate(db, { migrationsFolder: opts.migrationsDir ?? process.env.MIGRATIONS_DIR ?? migrationsFolder() });
  }
  return createPgRepository(db, () => pool.end());
}
