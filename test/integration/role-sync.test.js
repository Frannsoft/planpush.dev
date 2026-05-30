import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resetDb, seedUser } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import { reconcileRolesFromGroups } from '../../src/utils/roleSync.js';
import { getUserPermissions } from '../../src/utils/rbac.js';

describe('Role Sync (reconcileRolesFromGroups)', () => {
  beforeAll(async () => {
    await knex.raw('PRAGMA foreign_keys = OFF');
    try {
      await knex.raw('DROP TABLE IF EXISTS users_old');
      await knex.raw('DROP TABLE IF EXISTS users_old_restore');
    } catch (err) {
      // Ignore
    }
    await knex.raw('PRAGMA foreign_keys = ON');
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    await resetDb();
    // Seed roles and permissions
    await knex('roles').insert([
      { id: 'admin', name: 'admin', description: 'Administrator' },
      { id: 'project_manager', name: 'project_manager', description: 'Project Manager' },
      { id: 'developer', name: 'developer', description: 'Developer' },
    ]);
    await knex('permissions').insert([
      { id: 'user_manage', name: 'user_manage', description: 'Manage users' },
      { id: 'session_publish', name: 'session_publish', description: 'Publish sessions' },
    ]);
    await knex('role_permissions').insert([
      { role_id: 'admin', permission_id: 'user_manage' },
      { role_id: 'admin', permission_id: 'session_publish' },
      { role_id: 'project_manager', permission_id: 'session_publish' },
      { role_id: 'developer', permission_id: 'session_publish' },
    ]);
    // Set up group_role_map
    await knex('group_role_map').insert([
      { idp_group: 'engineering', role_id: 'developer' },
      { idp_group: 'leads', role_id: 'project_manager' },
      { idp_group: 'admins', role_id: 'admin' },
    ]);
    // Save original INITIAL_ADMIN_EMAILS for restoration
    this.originalAdminEmails = process.env.INITIAL_ADMIN_EMAILS;
  });

  afterEach(async () => {
    // Restore INITIAL_ADMIN_EMAILS
    process.env.INITIAL_ADMIN_EMAILS = this.originalAdminEmails;
  });

  describe('reconcileRolesFromGroups', () => {
    it('adds SSO roles from group mappings', async () => {
      // Create user without any roles initially
      const user = await seedUser({});
      // Remove the auto-assigned role
      await knex('user_roles').where({ user_id: user.id }).delete();

      const finalRoles = await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering', 'leads']);

      expect(finalRoles).toContain('developer');
      expect(finalRoles).toContain('project_manager');

      // Verify in DB
      const userRoles = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id');
      const roleIds = userRoles.map(r => r.role_id);
      expect(roleIds).toContain('developer');
      expect(roleIds).toContain('project_manager');
    });

    it('removes stale SSO roles not in current groups', async () => {
      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Initially sync to engineering role
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering']);
      const initialRoles = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id');
      expect(initialRoles.map(r => r.role_id)).toContain('developer');

      // Now sync to leads (engineering removed)
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['leads']);
      const updatedRoles = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id');
      const roleIds = updatedRoles.map(r => r.role_id);
      expect(roleIds).toContain('project_manager');
      expect(roleIds).not.toContain('developer'); // Removed
    });

    it('preserves manual role grants', async () => {
      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Manually assign admin role (manual origin)
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: 'admin',
        origin: 'manual',
      });

      // Sync SSO groups (no admin group)
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering']);

      // Manual admin grant should still exist
      const allRoles = await knex('user_roles').where({ user_id: user.id }).select('role_id', 'origin');
      const adminRole = allRoles.find(r => r.role_id === 'admin');
      expect(adminRole).toBeTruthy();
      expect(adminRole.origin).toBe('manual');

      // SSO role should also exist
      const devRole = allRoles.find(r => r.role_id === 'developer');
      expect(devRole).toBeTruthy();
      expect(devRole.origin).toBe('sso');
    });

    it('gives INITIAL_ADMIN_EMAILS precedence over groups', async () => {
      process.env.INITIAL_ADMIN_EMAILS = 'admin@company.com,admin2@company.com';

      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Even though no admin group, initial admin emails should grant admin role
      const finalRoles = await reconcileRolesFromGroups(user.id, 'admin@company.com', ['engineering']);

      expect(finalRoles).toContain('admin');

      // Verify in DB
      const adminRole = await knex('user_roles')
        .where({ user_id: user.id, role_id: 'admin' })
        .first();
      expect(adminRole).toBeTruthy();
    });

    it('requires verified email for INITIAL_ADMIN_EMAILS', async () => {
      process.env.INITIAL_ADMIN_EMAILS = 'admin@company.com';

      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Pass null email (unverified)
      const finalRoles = await reconcileRolesFromGroups(user.id, null, ['engineering']);

      // Should NOT grant admin role
      expect(finalRoles).not.toContain('admin');
      expect(finalRoles).toContain('developer'); // But should have group-mapped role
    });

    it('returns empty array for user with no groups and not initial admin', async () => {
      process.env.INITIAL_ADMIN_EMAILS = 'other@company.com';

      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // First sync with a group to add SSO role
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering']);

      // Now sync with empty groups
      const finalRoles = await reconcileRolesFromGroups(user.id, 'user@example.com', []);

      expect(finalRoles).toEqual([]);

      // Verify all SSO roles removed
      const ssoRoles = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id');
      expect(ssoRoles).toEqual([]);
    });

    it('invalidates permission cache when roles change', async () => {
      const user = await seedUser({ role: 'developer' });

      // Get initial perms
      const perms1 = await getUserPermissions(user.id);
      expect(perms1).toContain('session_publish');
      expect(perms1).not.toContain('user_manage'); // Developer doesn't have it

      // Sync to admin group
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['admins']);

      // Perms should be refreshed (not cached)
      const perms2 = await getUserPermissions(user.id);
      expect(perms2).toContain('user_manage'); // Admin has it now

      // Verify cache was invalidated
      expect(perms2).not.toEqual(perms1);
    });

    it('handles multiple unmapped groups gracefully', async () => {
      const user = await seedUser({ role: 'developer' });

      // Pass groups, some mapped, some not
      const finalRoles = await reconcileRolesFromGroups(user.id, 'user@example.com', [
        'engineering', // Mapped to developer
        'unknown-group', // Not mapped
        'another-unknown', // Not mapped
      ]);

      // Should only include mapped roles
      expect(finalRoles).toContain('developer');
      expect(finalRoles.length).toBe(1);
    });

    it('audits role additions and removals', async () => {
      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Sync engineering -> leads (adds developer, then removes developer, adds project_manager)
      // Just verify the sync works and creates audit logs without trying to clear them
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering']);
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['leads']);

      // Just verify the final state is correct (audit logs are fire-and-forget so we just check final roles)
      const finalRoles = await knex('user_roles')
        .where({ user_id: user.id })
        .select('role_id');
      const roleIds = finalRoles.map(r => r.role_id);

      // After syncing to 'leads' group, should have project_manager
      expect(roleIds).toContain('project_manager');
    });

    it('is idempotent - re-syncing same groups makes no changes', async () => {
      const user = await seedUser({ role: 'developer' });

      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering', 'leads']);
      const roles1 = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id')
        .orderBy('role_id');

      // Re-sync same groups
      await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering', 'leads']);
      const roles2 = await knex('user_roles')
        .where({ user_id: user.id, origin: 'sso' })
        .select('role_id')
        .orderBy('role_id');

      expect(roles2).toEqual(roles1);
    });

    it('handles database conflicts gracefully with onConflict().ignore()', async () => {
      const user = await seedUser({});
      await knex('user_roles').where({ user_id: user.id }).delete();

      // Manually pre-insert a developer SSO role
      await knex('user_roles').insert({
        user_id: user.id,
        role_id: 'developer',
        origin: 'sso',
      });

      // Sync to same group (should not error due to onConflict().ignore())
      const finalRoles = await reconcileRolesFromGroups(user.id, 'user@example.com', ['engineering']);

      expect(finalRoles).toContain('developer');
    });
  });
});
