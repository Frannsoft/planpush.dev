// Add user_id to device_codes table
// (was previously stored as github_user_id which mapped indirectly to users)

export async function up(knex) {
  const hasUserIdCol = await knex.schema.hasColumn('device_codes', 'user_id');
  if (!hasUserIdCol) {
    await knex.schema.table('device_codes', (t) => {
      t.text('user_id').references('id').inTable('users');
    });
  }
}

export async function down(knex) {
  const hasUserIdCol = await knex.schema.hasColumn('device_codes', 'user_id');
  if (hasUserIdCol) {
    await knex.schema.table('device_codes', (t) => {
      t.dropColumn('user_id');
    });
  }
}
