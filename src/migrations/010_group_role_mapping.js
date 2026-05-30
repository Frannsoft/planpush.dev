// Phase 4: Group-to-role mapping table and origin tracking on user_roles
// Create group_role_map for Okta group -> role mappings
// Add origin column to user_roles to distinguish SSO-derived vs manual assignments

export async function up(knex) {
  const now = knex.raw('CURRENT_TIMESTAMP');

  // Create group_role_map table
  if (!(await knex.schema.hasTable('group_role_map'))) {
    await knex.schema.createTable('group_role_map', (t) => {
      t.increments('id').primary();
      t.text('idp_group').notNullable();
      t.text('role_id').notNullable().references('id').inTable('roles');
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
      t.unique(['idp_group', 'role_id']);
    });
  }

  // Add origin column to user_roles (sso | manual)
  const hasOriginCol = await knex.schema.hasColumn('user_roles', 'origin');
  if (!hasOriginCol) {
    await knex.schema.table('user_roles', (t) => {
      t.text('origin').notNullable().defaultTo('manual');
    });
  }
}

export async function down(knex) {
  const hasOriginCol = await knex.schema.hasColumn('user_roles', 'origin');
  if (hasOriginCol) {
    await knex.schema.table('user_roles', (t) => {
      t.dropColumn('origin');
    });
  }

  await knex.schema.dropTableIfExists('group_role_map');
}
