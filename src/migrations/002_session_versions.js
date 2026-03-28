// Add session_versions table for tracking push history + resolved_at on comments

export async function up(knex) {
  const now = knex.raw('CURRENT_TIMESTAMP');

  if (!(await knex.schema.hasTable('session_versions'))) {
    await knex.schema.createTable('session_versions', (t) => {
      t.increments('id').primary();
      t.text('session_id').notNullable().references('id').inTable('sessions');
      t.integer('version').notNullable();
      t.text('pushed_by').notNullable().references('id').inTable('users');
      t.timestamp('pushed_at', { useTz: false }).notNullable().defaultTo(now);
    });
    await knex.schema.table('session_versions', (t) => {
      t.index(['session_id', 'version'], 'idx_session_versions_session_version');
    });
  }

  // Backfill: create version 1 entries for existing sessions
  const sessions = await knex('sessions').select('id', 'created_by', 'created_at');
  for (const s of sessions) {
    const exists = await knex('session_versions')
      .where({ session_id: s.id, version: 1 })
      .first();
    if (!exists) {
      await knex('session_versions').insert({
        session_id: s.id,
        version: 1,
        pushed_by: s.created_by,
        pushed_at: s.created_at,
      });
    }
  }

  // Add resolved_at column to comments
  const hasResolvedAt = await knex.schema.hasColumn('comments', 'resolved_at');
  if (!hasResolvedAt) {
    await knex.schema.table('comments', (t) => {
      t.timestamp('resolved_at', { useTz: false });
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('session_versions');

  const hasResolvedAt = await knex.schema.hasColumn('comments', 'resolved_at');
  if (hasResolvedAt) {
    await knex.schema.table('comments', (t) => {
      t.dropColumn('resolved_at');
    });
  }
}
