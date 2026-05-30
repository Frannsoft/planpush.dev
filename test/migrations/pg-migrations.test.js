// Postgres migration-parity check.
//
// The default suite runs against SQLite, which silently tolerates things real
// Postgres rejects (the 007 `DROP TABLE users_old` FK-dependency bug is the
// canonical example). This test applies the ENTIRE migration chain against a
// real Postgres — up, full rollback, then up again — so dialect/parity bugs
// surface locally before they hit Render.
//
// Run it with:  npm run test:migrations:pg   (requires Docker, or PG_TEST_URL)
// It is excluded from the default `npm test` and auto-skips when no Postgres
// is reachable, so it never blocks the normal SQLite suite.
import { describe, it, expect, afterAll } from 'vitest';
import knexLib from 'knex';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/migrations');

// Prefer a caller-supplied Postgres (PG_TEST_URL); otherwise spin a throwaway
// container via testcontainers. Returns { url, stop } or throws if unavailable.
async function provisionPostgres() {
  if (process.env.PG_TEST_URL) {
    return { url: process.env.PG_TEST_URL, stop: async () => {} };
  }
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  return { url: container.getConnectionUri(), stop: () => container.stop() };
}

let pg = null;
let knex = null;
let skipReason = '';

try {
  pg = await provisionPostgres();
  knex = knexLib({ client: 'pg', connection: pg.url, migrations: { directory: migrationsDir } });
  await knex.raw('select 1');
} catch (err) {
  skipReason = (err && err.message) || String(err);
  if (knex) { await knex.destroy().catch(() => {}); knex = null; }
  if (pg) { await pg.stop().catch(() => {}); pg = null; }
  // eslint-disable-next-line no-console
  console.warn(
    `\n[pg-migrations] SKIPPED — no Postgres available.\n` +
    `  Start Docker (testcontainers spins postgres:16-alpine automatically) or set PG_TEST_URL.\n` +
    `  reason: ${skipReason}\n`,
  );
}

describe.skipIf(!knex)('Postgres migration parity (real Postgres)', () => {
  afterAll(async () => {
    if (knex) await knex.destroy().catch(() => {});
    if (pg) await pg.stop().catch(() => {});
  });

  it('migrate.latest() applies the whole chain up with nothing pending', async () => {
    const [, applied] = await knex.migrate.latest();
    expect(applied.length).toBeGreaterThan(0); // a fresh DB applies every migration
    const [, pending] = await knex.migrate.list();
    expect(pending.length).toBe(0);
  });

  it('migrate.rollback(all) rolls the whole chain back down to nothing', async () => {
    await knex.migrate.rollback(undefined, true);
    expect(await knex.migrate.currentVersion()).toBe('none');
  });

  it('up → down → up is idempotent (re-apply after rollback is clean)', async () => {
    const [, applied] = await knex.migrate.latest();
    expect(applied.length).toBeGreaterThan(0);
    const [, pending] = await knex.migrate.list();
    expect(pending.length).toBe(0);
  });
});
