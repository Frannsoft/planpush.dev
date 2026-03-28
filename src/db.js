import knexLib from 'knex';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildKnexConfig() {
  if (process.env.DATABASE_URL) {
    return {
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 2, max: 10 },
      migrations: { directory: join(__dirname, 'migrations') },
    };
  }

  const DATA_DIR = process.env.DATA_DIR || './data';
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  return {
    client: 'better-sqlite3',
    connection: { filename: join(DATA_DIR, 'planpush.db') },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, done) {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
    migrations: { directory: join(__dirname, 'migrations') },
  };
}

export const knex = knexLib(buildKnexConfig());

// Run migrations at startup
await knex.migrate.latest();
console.log('[db] migrations up to date');
