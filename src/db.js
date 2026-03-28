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

const isPg = knex.client.config.client === 'pg';

// Normalize SQLite-specific SQL for PostgreSQL
function normalizeSql(sql) {
  if (!isPg) return sql;
  return sql.replace(/datetime\('now'\)/gi, 'NOW()');
}

// Run migrations at startup
await knex.migrate.latest();
console.log('[db] migrations up to date');

// Extract rows array from knex.raw() result (different shape per dialect)
function extractRows(result) {
  if (Array.isArray(result)) return result;
  if (result?.rows != null) return result.rows;           // pg
  if (result?.response != null) return result.response;   // better-sqlite3 via knex
  return [];
}

// D1-compatible adapter — preserves .prepare().bind().first()/all()/run() interface
function createDbAdapter(knex) {
  return {
    prepare(sql) {
      const normalized = normalizeSql(sql);
      let params = [];
      const stmt = {
        bind(...args) {
          params = args;
          return stmt;
        },
        async first() {
          const result = await knex.raw(normalized, params);
          const rows = extractRows(result);
          return rows[0] ?? null;
        },
        async all() {
          const result = await knex.raw(normalized, params);
          return { results: extractRows(result) };
        },
        async run() {
          await knex.raw(normalized, params);
        },
      };
      return stmt;
    },

    // Expose knex instance for transactions and query builder usage
    _knex: knex,
  };
}

export const db = createDbAdapter(knex);
