import { createGameServer } from './app';
import { loadConfig } from './config';
import { connectPostgres } from './db/connect';
import { noopRepository } from './db/repository';

const config = loadConfig();

let repo = noopRepository;
if (config.DATABASE_URL) {
  repo = await connectPostgres(config.DATABASE_URL);
  console.log('[db] connected, migrations applied');
} else {
  console.warn('[db] DATABASE_URL not set - match history and stats will NOT be persisted');
}

const app = createGameServer({ config, repo });
const port = await app.listen();
console.log(`[server] MiniGameHub listening on ${config.HOST}:${port} (${config.NODE_ENV})`);
console.log(`[server] allowed origins: ${config.anyOrigin ? '*' : config.allowedOrigins.join(', ')}`);

const stop = async (signal: string) => {
  console.log(`[server] ${signal} received, shutting down gracefully`);
  try {
    await app.shutdown();
  } finally {
    process.exit(0);
  }
};
process.once('SIGTERM', () => void stop('SIGTERM'));
process.once('SIGINT', () => void stop('SIGINT'));
