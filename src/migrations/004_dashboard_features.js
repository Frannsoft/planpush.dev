// Dashboard features: session archiving, per-session view tracking

export async function up(knex) {
  // Add archived_at to sessions
  if (!(await knex.schema.hasColumn('sessions', 'archived_at'))) {
    await knex.schema.table('sessions', (t) => {
      t.timestamp('archived_at', { useTz: false });
    });
  }

  // Create session_views table for "new since last visit" tracking
  if (!(await knex.schema.hasTable('session_views'))) {
    await knex.schema.createTable('session_views', (t) => {
      t.text('user_id').notNullable().references('id').inTable('users');
      t.text('session_id').notNullable().references('id').inTable('sessions');
      t.timestamp('last_viewed_at', { useTz: false }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
      t.primary(['user_id', 'session_id']);
    });
    await knex.schema.table('session_views', (t) => {
      t.index('session_id', 'idx_session_views_session_id');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('session_views');

  if (await knex.schema.hasColumn('sessions', 'archived_at')) {
    await knex.schema.table('sessions', (t) => {
      t.dropColumn('archived_at');
    });
  }
}
