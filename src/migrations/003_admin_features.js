// Admin features: soft-delete sessions, deactivate users, token revocation, audit log

export async function up(knex) {
  // Add deleted_at to sessions for soft-delete
  if (!(await knex.schema.hasColumn('sessions', 'deleted_at'))) {
    await knex.schema.table('sessions', (t) => {
      t.timestamp('deleted_at', { useTz: false });
    });
  }

  // Add deactivated_at to users
  if (!(await knex.schema.hasColumn('users', 'deactivated_at'))) {
    await knex.schema.table('users', (t) => {
      t.timestamp('deactivated_at', { useTz: false });
    });
  }

  // Add revoked_at and label to api_tokens
  if (!(await knex.schema.hasColumn('api_tokens', 'revoked_at'))) {
    await knex.schema.table('api_tokens', (t) => {
      t.timestamp('revoked_at', { useTz: false });
      t.text('label');
    });
  }

  // Create audit_log table
  if (!(await knex.schema.hasTable('audit_log'))) {
    await knex.schema.createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.text('actor_id').references('id').inTable('users');
      t.text('action').notNullable();
      t.text('target_type');
      t.text('target_id');
      t.text('meta'); // JSON blob
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    });
    await knex.schema.table('audit_log', (t) => {
      t.index(['created_at'], 'idx_audit_log_created_at');
      t.index(['actor_id'], 'idx_audit_log_actor_id');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_log');

  if (await knex.schema.hasColumn('api_tokens', 'revoked_at')) {
    await knex.schema.table('api_tokens', (t) => { t.dropColumn('revoked_at'); });
  }
  if (await knex.schema.hasColumn('api_tokens', 'label')) {
    await knex.schema.table('api_tokens', (t) => { t.dropColumn('label'); });
  }

  if (await knex.schema.hasColumn('users', 'deactivated_at')) {
    await knex.schema.table('users', (t) => {
      t.dropColumn('deactivated_at');
    });
  }

  if (await knex.schema.hasColumn('sessions', 'deleted_at')) {
    await knex.schema.table('sessions', (t) => {
      t.dropColumn('deleted_at');
    });
  }
}
