// Initial schema — creates all tables for PlanPush + KV store
// Works with both SQLite (better-sqlite3) and PostgreSQL

export async function up(knex) {
  const now = knex.raw('CURRENT_TIMESTAMP');

  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (t) => {
      t.text('id').primary();
      t.text('github_user_id').notNullable().unique();
      t.text('github_username').notNullable();
      t.text('display_name');
      t.text('avatar_url');
      t.text('role').notNullable().defaultTo('member');
      t.timestamp('joined_at', { useTz: false }).notNullable().defaultTo(now);
    });
  }

  if (!(await knex.schema.hasTable('sessions'))) {
    await knex.schema.createTable('sessions', (t) => {
      t.text('id').primary();
      t.text('title');
      t.text('created_by').notNullable().references('id').inTable('users');
      t.integer('current_version').notNullable().defaultTo(1);
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
      t.timestamp('last_updated', { useTz: false }).notNullable().defaultTo(now);
    });
    await knex.schema.table('sessions', (t) => {
      t.index('created_by', 'idx_sessions_created_by');
      t.index('last_updated', 'idx_sessions_last_updated');
    });
  }

  if (!(await knex.schema.hasTable('comments'))) {
    await knex.schema.createTable('comments', (t) => {
      t.text('id').primary();
      t.text('session_id').notNullable().references('id').inTable('sessions');
      t.text('author_id').notNullable().references('id').inTable('users');
      t.text('content').notNullable();
      t.text('anchor');
      t.integer('plan_version').notNullable().defaultTo(1);
      t.integer('resolved').notNullable().defaultTo(0);
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
    });
    await knex.schema.table('comments', (t) => {
      t.index('session_id', 'idx_comments_session_id');
    });
  }

  if (!(await knex.schema.hasTable('api_tokens'))) {
    await knex.schema.createTable('api_tokens', (t) => {
      t.text('id').primary();
      t.text('user_id').notNullable().references('id').inTable('users');
      t.text('hashed_token').notNullable();
      t.timestamp('issued_at', { useTz: false }).notNullable().defaultTo(now);
      t.timestamp('last_used_at', { useTz: false });
    });
    await knex.schema.table('api_tokens', (t) => {
      t.index('hashed_token', 'idx_api_tokens_hashed_token');
    });
  }

  if (!(await knex.schema.hasTable('device_codes'))) {
    await knex.schema.createTable('device_codes', (t) => {
      t.text('device_code').primary();
      t.text('user_code').notNullable().unique();
      t.text('status').notNullable().defaultTo('pending');
      t.text('github_user_id');
      t.timestamp('expires_at', { useTz: false }).notNullable();
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
    });
    await knex.schema.table('device_codes', (t) => {
      t.index('user_code', 'idx_device_codes_user_code');
    });
  }

  if (!(await knex.schema.hasTable('kv_store'))) {
    await knex.schema.createTable('kv_store', (t) => {
      t.text('key').primary();
      t.text('value').notNullable();
      t.timestamp('expires_at', { useTz: false });
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('kv_store');
  await knex.schema.dropTableIfExists('device_codes');
  await knex.schema.dropTableIfExists('api_tokens');
  await knex.schema.dropTableIfExists('comments');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('users');
}
