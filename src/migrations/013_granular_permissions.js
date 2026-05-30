// Introduce per-action permissions to replace overloaded user_manage:
// - session_delete: delete sessions (was gated by user_manage)
// - group_manage: manage group-role mappings (was gated by user_manage)
// Grant these permissions to admin role to preserve current access.
// user_manage remains for user role changes and deactivation.

export async function up(knex) {
  // Insert new permissions
  const newPerms = [
    { id: 'session_delete', name: 'session_delete', description: 'Delete sessions' },
    { id: 'group_manage', name: 'group_manage', description: 'Manage group-role mappings' },
  ];

  for (const perm of newPerms) {
    await knex('permissions').insert(perm).onConflict().ignore();
  }

  // Grant session_delete and group_manage to admin (admin already has user_manage)
  await knex('role_permissions')
    .insert({ role_id: 'admin', permission_id: 'session_delete' })
    .onConflict()
    .ignore();
  await knex('role_permissions')
    .insert({ role_id: 'admin', permission_id: 'group_manage' })
    .onConflict()
    .ignore();
}

export async function down(knex) {
  // Remove the new permissions from role_permissions
  await knex('role_permissions')
    .whereIn('permission_id', ['session_delete', 'group_manage'])
    .delete();

  // Delete the permissions
  await knex('permissions')
    .whereIn('id', ['session_delete', 'group_manage'])
    .delete();
}
