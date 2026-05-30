// RBAC schema: roles, permissions, role_permissions, user_roles
// Seed default roles + permission matrix
// Backfill user_roles from users.role

export async function up(knex) {
  const now = knex.raw('CURRENT_TIMESTAMP');

  // Create roles table
  if (!(await knex.schema.hasTable('roles'))) {
    await knex.schema.createTable('roles', (t) => {
      t.text('id').primary();
      t.text('name').notNullable().unique();
      t.text('description');
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
    });
  }

  // Create permissions table
  if (!(await knex.schema.hasTable('permissions'))) {
    await knex.schema.createTable('permissions', (t) => {
      t.text('id').primary();
      t.text('name').notNullable().unique();
      t.text('description');
      t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(now);
    });
  }

  // Create role_permissions junction
  if (!(await knex.schema.hasTable('role_permissions'))) {
    await knex.schema.createTable('role_permissions', (t) => {
      t.text('role_id').notNullable().references('id').inTable('roles');
      t.text('permission_id').notNullable().references('id').inTable('permissions');
      t.primary(['role_id', 'permission_id']);
    });
  }

  // Create user_roles junction with UNIQUE constraint
  if (!(await knex.schema.hasTable('user_roles'))) {
    await knex.schema.createTable('user_roles', (t) => {
      t.text('user_id').notNullable().references('id').inTable('users');
      t.text('role_id').notNullable().references('id').inTable('roles');
      t.unique(['user_id', 'role_id']);
    });
  }

  // Seed default permissions (8 total: 1 baseline + 7 admin-exclusive)
  const baselinePerms = [
    'view_published_plans',
    'comment_create',
    'comment_resolve',
  ];
  const adminExclusivePerms = [
    'session_create',
    'session_publish',
    'session_archive',
    'session_view_private',
    'audit_view',
    'session_delete',
    'user_manage',
  ];
  const allPerms = [...baselinePerms, ...adminExclusivePerms];

  for (const perm of allPerms) {
    await knex('permissions').insert({ id: perm, name: perm }).onConflict().ignore();
  }

  // Seed default roles + role_permissions
  const roleMatrix = {
    admin: [
      'view_published_plans', 'comment_create', 'comment_resolve',
      'session_create', 'session_publish', 'session_archive',
      'session_view_private', 'audit_view', 'session_delete', 'user_manage',
    ],
    project_manager: [
      'view_published_plans', 'comment_create', 'comment_resolve',
      'session_create', 'session_publish', 'session_archive', 'session_view_private', 'audit_view',
    ],
    developer: [
      'view_published_plans', 'comment_create', 'comment_resolve', 'session_create',
      'session_publish', 'session_archive',
    ],
    qa: [
      'view_published_plans', 'comment_create', 'comment_resolve',
    ],
  };

  for (const [roleId, perms] of Object.entries(roleMatrix)) {
    // Insert role if not exists
    await knex('roles').insert({ id: roleId, name: roleId }).onConflict().ignore();

    // Insert role_permissions (ignore if already exists)
    for (const permId of perms) {
      await knex('role_permissions')
        .insert({ role_id: roleId, permission_id: permId })
        .onConflict()
        .ignore();
    }
  }

  // Backfill user_roles from users.role
  // member -> developer, admin -> admin
  const users = await knex('users').select('id', 'role');
  for (const user of users) {
    const targetRole = user.role === 'admin' ? 'admin' : 'developer';
    await knex('user_roles')
      .insert({ user_id: user.id, role_id: targetRole })
      .onConflict()
      .ignore();
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
}
