// RBAC indexes — add indexes on user_roles(user_id) and role_permissions(role_id)
// Performance: permission resolution scans these tables on cache miss

export async function up(knex) {
  // Index on user_roles(user_id) for resolving user permissions
  // Wrapped in try/catch because hasIndex doesn't exist on all DB drivers
  try {
    await knex.schema.table('user_roles', (t) => {
      t.index('user_id', 'idx_user_roles_user_id');
    });
  } catch (err) {
    // Index may already exist or DB doesn't support indexed check; continue
    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
      console.warn('user_roles index creation:', err.message);
    }
  }

  // Index on role_permissions(role_id) for resolving role permissions
  try {
    await knex.schema.table('role_permissions', (t) => {
      t.index('role_id', 'idx_role_permissions_role_id');
    });
  } catch (err) {
    // Index may already exist or DB doesn't support indexed check; continue
    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
      console.warn('role_permissions index creation:', err.message);
    }
  }
}

export async function down(knex) {
  // Drop indexes if they exist (wrapped in try/catch for safety)
  try {
    await knex.schema.table('user_roles', (t) => {
      t.dropIndex([], 'idx_user_roles_user_id');
    });
  } catch (err) {
    // Index may not exist; continue
    console.warn('user_roles index drop:', err.message);
  }

  try {
    await knex.schema.table('role_permissions', (t) => {
      t.dropIndex([], 'idx_role_permissions_role_id');
    });
  } catch (err) {
    // Index may not exist; continue
    console.warn('role_permissions index drop:', err.message);
  }
}
