// Express-session table for server-backed browser sessions
// Works with both SQLite (better-sqlite3) and PostgreSQL

export async function up(knex) {
  if (!(await knex.schema.hasTable('sessions_store'))) {
    await knex.schema.createTable('sessions_store', (t) => {
      t.text('sid').primary();
      t.text('sess').notNullable();
      t.timestamp('expired', { useTz: false });
    });
    await knex.schema.table('sessions_store', (t) => {
      t.index('expired', 'idx_sessions_store_expired');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('sessions_store');
}
