import { connectPostgres } from './connect';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const repo = await connectPostgres(url, { runMigrations: true });
console.log('Migrations applied.');
await repo.close();
