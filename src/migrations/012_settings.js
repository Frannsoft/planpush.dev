// Admin Settings store — configuration backed by database
// Secrets (OKTA_CLIENT_SECRET, SCIM_AUTH_TOKEN) are encrypted at rest using AES-256-GCM

export async function up(knex) {
  if (!(await knex.schema.hasTable('settings'))) {
    await knex.schema.createTable('settings', (t) => {
      t.text('key').primary();
      t.text('value').nullable(); // JSON-serialized (encrypted for secrets)
      t.integer('is_secret').notNullable().defaultTo(0); // 1 = AES-256-GCM encrypted
      t.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
      t.text('updated_by').nullable(); // user ID of who made the change
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('settings');
}
