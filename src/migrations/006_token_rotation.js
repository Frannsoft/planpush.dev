export async function up(knex) {
  await knex.schema.alterTable('api_tokens', (table) => {
    table.string('family_id').nullable();
    table.index('family_id');
  });

  // Backfill: set family_id = id for existing tokens so they work with rotation logic
  await knex.raw('UPDATE api_tokens SET family_id = id WHERE family_id IS NULL');
}

export async function down(knex) {
  await knex.schema.alterTable('api_tokens', (table) => {
    table.dropIndex('family_id');
    table.dropColumn('family_id');
  });
}
