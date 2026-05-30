import knexLib from 'knex';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildKnexConfig() {
  if (process.env.NODE_ENV === 'test') {
    return {
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: { min: 1, max: 1, afterCreate(c, done) { c.pragma('foreign_keys = ON'); done(null, c); } },
      migrations: { directory: join(__dirname, 'migrations') },
    };
  }

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

const usingPg = !!process.env.DATABASE_URL && process.env.NODE_ENV !== 'test';

// Host/port/db only — never logs the password
function dbTarget() {
  if (!usingPg) return 'sqlite';
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.username ? u.username + '@' : ''}${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return 'postgres';
  }
}

// Turn a raw connection error into a single actionable hint
function diagnose(err) {
  const msg = (err && err.message) || String(err);
  const code = err && err.code;
  if (/tenant or user not found/i.test(msg) || (code === 'XX000' && /tenant/i.test(msg))) {
    return 'Supabase pooler rejected the connection (tenant/user not found): the project may be PAUSED, or DATABASE_URL has the wrong host region / username (must be postgres.<project-ref> for the pooler) / password.';
  }
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'Password authentication failed — check the DATABASE_URL password.';
  if (code === '3D000' || /database .* does not exist/i.test(msg)) return 'Target database does not exist — check the database name in DATABASE_URL.';
  if (code === 'ENOTFOUND') return 'DB host not found (DNS) — check the hostname in DATABASE_URL.';
  if (code === 'ECONNREFUSED') return 'Connection refused — check the DB host/port and that it accepts connections from this host.';
  if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'Connection timed out — check network/firewall rules for this host.';
  if (/\bSSL\b|self-signed certificate|no encryption/i.test(msg)) return 'TLS/SSL problem — Supabase requires SSL; append ?sslmode=require to DATABASE_URL.';
  return null;
}

// Run migrations at startup, retrying transient connection failures
async function initDb() {
  const maxAttempts = usingPg ? 5 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await knex.migrate.latest();
      console.log('[db] migrations up to date');
      return;
    } catch (err) {
      console.error(`[db] connect/migrate failed (attempt ${attempt}/${maxAttempts}) target=${dbTarget()} code=${err.code || 'n/a'}: ${err.message}`);
      if (attempt === 1) {
        const hint = diagnose(err);
        if (hint) console.error(`[db] hint: ${hint}`);
      }
      if (attempt === maxAttempts) {
        console.error('[db] giving up — exiting. Fix DATABASE_URL / database availability and redeploy.');
        await knex.destroy().catch(() => {});
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

await initDb();
