// Decouple user identity from GitHub
// - Create user_identities table (separate from users)
// - Add users.email column
// - Backfill existing GitHub users into user_identities
// - Relax users.github_user_id to nullable + drop UNIQUE constraint

export async function up(knex) {
  // Create user_identities table
  if (!(await knex.schema.hasTable('user_identities'))) {
    await knex.schema.createTable('user_identities', (t) => {
      t.text('id').primary();
      t.text('user_id').notNullable().references('id').inTable('users');
      t.text('idp').notNullable(); // 'github', 'okta', etc.
      t.text('subject').notNullable(); // GitHub user ID, Okta sub, etc.
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
      t.unique(['idp', 'subject']);
    });
    await knex.schema.table('user_identities', (t) => {
      t.index('user_id', 'idx_user_identities_user_id');
      t.index(['idp', 'subject'], 'idx_user_identities_idp_subject');
    });
  }

  // Add email column to users
  const hasEmail = await knex.schema.hasColumn('users', 'email');
  if (!hasEmail) {
    await knex.schema.table('users', (t) => {
      t.text('email');
    });
  }

  // On SQLite, we need a table rebuild to relax the NOT NULL + UNIQUE constraint on github_user_id
  // On PostgreSQL, we can ALTER COLUMN
  const isPostgres = ['pg', 'postgres', 'postgresql'].includes(knex.client.config.client);

  if (isPostgres) {
    // PostgreSQL: drop UNIQUE constraint, then relax NOT NULL
    await knex.schema.raw(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_github_user_id_unique;
    `);
    await knex.schema.raw(`
      ALTER TABLE users ALTER COLUMN github_user_id DROP NOT NULL;
    `);
  } else {
    // SQLite: rename → create new → migrate data → drop old → rename
    // Knex doesn't have a direct table.renameColumn, so we use raw SQL
    const tempTableName = 'users_old';
    const userTableSchema = `
      id TEXT PRIMARY KEY,
      github_user_id TEXT,
      github_username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deactivated_at TIMESTAMP
    `;

    // Rename current users table
    await knex.schema.raw(`ALTER TABLE users RENAME TO ${tempTableName};`);

    // Create new users table with relaxed github_user_id (no UNIQUE, nullable)
    await knex.schema.raw(`
      CREATE TABLE users (
        ${userTableSchema}
      );
    `);

    // Copy data back
    await knex.schema.raw(`
      INSERT INTO users (id, github_user_id, github_username, display_name, avatar_url, role, joined_at, deactivated_at)
      SELECT id, github_user_id, github_username, display_name, avatar_url, role, joined_at, deactivated_at
      FROM ${tempTableName};
    `);

    // Drop old table
    await knex.schema.raw(`DROP TABLE ${tempTableName};`);

    // Recreate indexes that were on users table
    await knex.schema.raw(`CREATE INDEX idx_users_github_user_id ON users(github_user_id);`);
  }

  // Backfill existing GitHub users into user_identities
  const existingUsers = await knex('users')
    .whereNotNull('github_user_id')
    .select('id', 'github_user_id');

  if (existingUsers.length > 0) {
    const identities = existingUsers.map((u) => ({
      id: `${u.id}-github`,
      user_id: u.id,
      idp: 'github',
      subject: u.github_user_id,
      created_at: knex.fn.now(),
    }));
    await knex('user_identities').insert(identities);
  }
}

export async function down(knex) {
  // Delete user_identities
  await knex.schema.dropTableIfExists('user_identities');

  // Remove email column
  const hasEmail = await knex.schema.hasColumn('users', 'email');
  if (hasEmail) {
    await knex.schema.table('users', (t) => {
      t.dropColumn('email');
    });
  }

  // Restore NOT NULL + UNIQUE on github_user_id
  const isPostgres = ['pg', 'postgres', 'postgresql'].includes(knex.client.config.client);

  if (isPostgres) {
    await knex.schema.raw(`
      ALTER TABLE users ALTER COLUMN github_user_id SET NOT NULL;
    `);
    await knex.schema.raw(`
      ALTER TABLE users ADD CONSTRAINT users_github_user_id_unique UNIQUE (github_user_id);
    `);
  } else {
    // SQLite: rebuild again
    const tempTableName = 'users_old_restore';
    const userTableSchema = `
      id TEXT PRIMARY KEY,
      github_user_id TEXT NOT NULL UNIQUE,
      github_username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deactivated_at TIMESTAMP
    `;

    await knex.schema.raw(`ALTER TABLE users RENAME TO ${tempTableName};`);

    await knex.schema.raw(`
      CREATE TABLE users (
        ${userTableSchema}
      );
    `);

    await knex.schema.raw(`
      INSERT INTO users (id, github_user_id, github_username, display_name, avatar_url, role, joined_at, deactivated_at)
      SELECT id, github_user_id, github_username, display_name, avatar_url, role, joined_at, deactivated_at
      FROM ${tempTableName};
    `);

    await knex.schema.raw(`DROP TABLE ${tempTableName};`);
    await knex.schema.raw(`CREATE INDEX idx_users_github_user_id ON users(github_user_id);`);
  }
}
