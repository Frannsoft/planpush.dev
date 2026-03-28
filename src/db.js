import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || './data';

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, 'planpush.db');
const rawDb = new Database(DB_PATH);
rawDb.pragma('journal_mode = WAL');
rawDb.pragma('foreign_keys = ON');

// Run migrations from src/migrations/
const migrationsDir = join(__dirname, 'migrations');
rawDb.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);
const applied = new Set(rawDb.prepare('SELECT name FROM _migrations').all().map(r => r.name));
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(migrationsDir, file), 'utf-8');
  rawDb.exec(sql);
  rawDb.prepare("INSERT INTO _migrations VALUES (?, datetime('now'))").run(file);
  console.log(`[db] applied migration: ${file}`);
}

// D1-compatible shim: exposes .prepare(sql).bind(...).first()/.all()/.run()
function createShim(rawDb) {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) {
          params = args;
          return this;
        },
        first() {
          return Promise.resolve(rawDb.prepare(sql).get(...params) ?? null);
        },
        all() {
          return Promise.resolve({ results: rawDb.prepare(sql).all(...params) });
        },
        run() {
          return Promise.resolve(rawDb.prepare(sql).run(...params));
        },
      };
    },
    // Run a function inside an IMMEDIATE transaction (serialized writes)
    transaction(fn) {
      const txn = rawDb.transaction(fn);
      return (...args) => Promise.resolve(txn(...args));
    },
    // Direct access for transaction internals
    _raw: rawDb,
  };
}

export const db = createShim(rawDb);
