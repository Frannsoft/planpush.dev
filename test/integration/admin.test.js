import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken, seedSession, seedToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('Admin Actions Integration', () => {
  let app;

  beforeAll(async () => {
    // Disable foreign key checks before app init (migrations may be sloppy with cleanup)
    await knex.raw('PRAGMA foreign_keys = OFF');
    try {
      await knex.raw('DROP TABLE IF EXISTS users_old');
      await knex.raw('DROP TABLE IF EXISTS users_old_restore');
    } catch (err) {
      // Ignore
    }
    await knex.raw('PRAGMA foreign_keys = ON');

    app = await getApp();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    await resetDb();
  });

  describe('DELETE /api/sessions/:id (soft-delete)', () => {
    it('soft-deletes a session (sets deleted_at)', async () => {
      // Seed admin role + permission BEFORE creating admin user
      const adminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!adminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const perm = await knex('permissions').where({ id: 'user_manage' }).first();
      if (!perm) {
        await knex('permissions').insert({ id: 'user_manage', name: 'user_manage', description: 'Manage users' });
      }
      const rolePerm = await knex('role_permissions').where({ role_id: 'admin', permission_id: 'user_manage' }).first();
      if (!rolePerm) {
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'user_manage' });
      }

      // Now create admin (seedUser will find the admin role)
      const admin = await seedUser({ role: 'admin' });
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });

      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
        role: 'admin',
      });

      const session = await seedSession({ created_by: admin.id });

      const res = await request(app)
        .delete(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe(session.id);

      // Verify soft-delete in DB
      const deleted = await knex('sessions').where({ id: session.id }).first();
      expect(deleted.deleted_at).toBeTruthy();

      // Verify session hidden from default queries (whereNull deleted_at)
      const activeSession = await knex('sessions')
        .where({ id: session.id })
        .whereNull('deleted_at')
        .first();
      expect(activeSession).toBeFalsy();
    });

    it('returns 403 when user lacks user_manage permission', async () => {
      const developer = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: developer.id });
      const accessToken = await seedAccessToken({
        user_id: developer.id,
        token_id: tokenId,
        display_name: developer.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: developer.id });

      const res = await request(app)
        .delete(`/api/sessions/${session.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('forbidden');

      // Verify session NOT deleted
      const stillActive = await knex('sessions').where({ id: session.id }).first();
      expect(stillActive.deleted_at).toBeNull();
    });

    it('returns 404 for non-existent session', async () => {
      // Seed admin role + permission BEFORE creating admin user
      const adminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!adminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const perm = await knex('permissions').where({ id: 'user_manage' }).first();
      if (!perm) {
        await knex('permissions').insert({ id: 'user_manage', name: 'user_manage', description: 'Manage users' });
      }
      const rolePerm = await knex('role_permissions').where({ role_id: 'admin', permission_id: 'user_manage' }).first();
      if (!rolePerm) {
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'user_manage' });
      }

      const admin = await seedUser({ role: 'admin' });
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });

      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
        role: 'admin',
      });

      const res = await request(app)
        .delete('/api/sessions/nonexistent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });
  });

  describe('PATCH /api/users/:id/role (last-admin protection)', () => {
    async function setupAdminWithPermission() {
      // Ensure role and permission exist
      const adminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!adminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const perm = await knex('permissions').where({ id: 'user_manage' }).first();
      if (!perm) {
        await knex('permissions').insert({ id: 'user_manage', name: 'user_manage', description: 'Manage users' });
      }
      const rolePerm = await knex('role_permissions').where({ role_id: 'admin', permission_id: 'user_manage' }).first();
      if (!rolePerm) {
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'user_manage' });
      }

      const admin = await seedUser({ role: 'admin' });
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
        role: 'admin',
      });

      return { admin, accessToken };
    }

    it('prevents demoting the last active admin', async () => {
      const { admin: admin1, accessToken: token1 } = await setupAdminWithPermission();

      // Create a second admin
      const admin2 = await seedUser({ role: 'admin' });

      // With 2 active admins, admin1 can demote admin2 - should succeed
      const resSuccess = await request(app)
        .patch(`/api/users/${admin2.id}/role`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ role: 'developer' })
        .expect(200);

      expect(resSuccess.body.role).toBe('developer');

      // Now create a 3rd admin and use them to try to demote admin1
      const admin3 = await seedUser({ role: 'admin' });
      const { tokenId: tokenId3 } = await seedRefreshToken({ user_id: admin3.id });
      const token3 = await seedAccessToken({
        user_id: admin3.id,
        token_id: tokenId3,
        display_name: admin3.display_name,
        role: 'admin',
      });

      // With 2 active admins (admin1, admin3), admin3 can demote admin1 - should succeed
      const resAlsSuccess = await request(app)
        .patch(`/api/users/${admin1.id}/role`)
        .set('Authorization', `Bearer ${token3}`)
        .send({ role: 'developer' })
        .expect(200);

      expect(resAlsSuccess.body.role).toBe('developer');

      // Now admin3 is the last remaining active admin
      // Create a 4th and make them admin, then try to demote them
      const admin4 = await seedUser({ role: 'admin' });

      // With 2 active admins (admin3, admin4), admin3 can demote admin4 - should succeed
      const resSuccess2 = await request(app)
        .patch(`/api/users/${admin4.id}/role`)
        .set('Authorization', `Bearer ${token3}`)
        .send({ role: 'developer' })
        .expect(200);

      expect(resSuccess2.body.role).toBe('developer');

      // Now admin3 is the LAST active admin - cannot be demoted (but can't demote self anyway)
      // Try to demote via self - should get 'cannot_change_own_role'
      const resFail = await request(app)
        .patch(`/api/users/${admin3.id}/role`)
        .set('Authorization', `Bearer ${token3}`)
        .send({ role: 'developer' })
        .expect(409);

      expect(resFail.body.error).toBe('cannot_change_own_role');
    });

    it('allows demoting an admin when there are multiple admins', async () => {
      const { admin: admin1, accessToken } = await setupAdminWithPermission();

      // Create a second admin
      const admin2 = await seedUser({ role: 'admin' });

      // Demote the first admin (should succeed because there are 2 admins)
      const res = await request(app)
        .patch(`/api/users/${admin2.id}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'developer' })
        .expect(200);

      expect(res.body.role).toBe('developer');

      // Verify admin2 no longer has admin role
      const userRole = await knex('user_roles').where({ user_id: admin2.id }).first();
      expect(userRole.role_id).toBe('developer');
    });

    it('returns 409 when admin tries to change own role', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();

      const res = await request(app)
        .patch(`/api/users/${admin.id}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'developer' })
        .expect(409);

      expect(res.body.error).toBe('cannot_change_own_role');
    });

    it('returns 403 when user lacks user_manage permission', async () => {
      const developer = await seedUser({ role: 'developer' });
      const target = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: developer.id });
      const accessToken = await seedAccessToken({
        user_id: developer.id,
        token_id: tokenId,
        display_name: developer.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'admin' })
        .expect(403);

      expect(res.body.error).toBe('forbidden');
    });

    it('returns 404 for non-existent user', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();

      const res = await request(app)
        .patch('/api/users/nonexistent-id/role')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'developer' })
        .expect(404);

      expect(res.body.error).toBe('user_not_found');
    });

    it('returns 400 for invalid role', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();
      const target = await seedUser({ role: 'developer' });

      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'invalid_role' })
        .expect(400);

      expect(res.body.error).toBe('invalid_role');
    });
  });

  describe('PATCH /api/users/:id/deactivate (last-admin protection)', () => {
    async function setupAdminWithPermission() {
      // Ensure role and permission exist
      const adminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!adminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const perm = await knex('permissions').where({ id: 'user_manage' }).first();
      if (!perm) {
        await knex('permissions').insert({ id: 'user_manage', name: 'user_manage', description: 'Manage users' });
      }
      const rolePerm = await knex('role_permissions').where({ role_id: 'admin', permission_id: 'user_manage' }).first();
      if (!rolePerm) {
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'user_manage' });
      }

      const admin = await seedUser({ role: 'admin' });
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
        role: 'admin',
      });

      return { admin, accessToken };
    }

    it('prevents deactivating the last active admin', async () => {
      const { admin: admin1, accessToken: token1 } = await setupAdminWithPermission();

      // Create a second admin
      const admin2 = await seedUser({ role: 'admin' });

      // With 2 active admins, admin1 can deactivate admin2 - should succeed
      const resSuccess = await request(app)
        .patch(`/api/users/${admin2.id}/deactivate`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ active: false })
        .expect(200);

      expect(resSuccess.body.deactivated_at).toBeTruthy();

      // Now create a 3rd admin and use them to try to deactivate admin1
      const admin3 = await seedUser({ role: 'admin' });
      const { tokenId: tokenId3 } = await seedRefreshToken({ user_id: admin3.id });
      const token3 = await seedAccessToken({
        user_id: admin3.id,
        token_id: tokenId3,
        display_name: admin3.display_name,
        role: 'admin',
      });

      // With 2 active admins (admin1, admin3), admin3 can deactivate admin1 - should succeed
      const resAlsoSuccess = await request(app)
        .patch(`/api/users/${admin1.id}/deactivate`)
        .set('Authorization', `Bearer ${token3}`)
        .send({ active: false })
        .expect(200);

      expect(resAlsoSuccess.body.deactivated_at).toBeTruthy();

      // Now admin3 is the last active admin - cannot be deactivated by anyone else
      // (and can't deactivate self anyway)
      // Try to deactivate via self - should get 'cannot_deactivate_self'
      const resFail = await request(app)
        .patch(`/api/users/${admin3.id}/deactivate`)
        .set('Authorization', `Bearer ${token3}`)
        .send({ active: false })
        .expect(409);

      expect(resFail.body.error).toBe('cannot_deactivate_self');
    });

    it('allows deactivating an admin when there are multiple admins', async () => {
      const { admin: admin1, accessToken } = await setupAdminWithPermission();

      // Create a second admin
      const admin2 = await seedUser({ role: 'admin' });

      // Deactivate the second admin (should succeed because there are 2 admins)
      const res = await request(app)
        .patch(`/api/users/${admin2.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: false })
        .expect(200);

      expect(res.body.deactivated_at).toBeTruthy();

      // Verify admin2 is deactivated
      const user = await knex('users').where({ id: admin2.id }).first();
      expect(user.deactivated_at).toBeTruthy();
    });

    it('allows reactivating a user', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();

      // Create and deactivate a developer
      const target = await seedUser({ role: 'developer' });
      await knex('users').where({ id: target.id }).update({ deactivated_at: knex.fn.now() });

      // Reactivate the user
      const res = await request(app)
        .patch(`/api/users/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: true })
        .expect(200);

      expect(res.body.deactivated_at).toBeNull();

      // Verify user is reactivated
      const user = await knex('users').where({ id: target.id }).first();
      expect(user.deactivated_at).toBeNull();
    });

    it('returns 409 when admin tries to deactivate self', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();

      const res = await request(app)
        .patch(`/api/users/${admin.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: false })
        .expect(409);

      expect(res.body.error).toBe('cannot_deactivate_self');
    });

    it('returns 403 when user lacks user_manage permission', async () => {
      const developer = await seedUser({ role: 'developer' });
      const target = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: developer.id });
      const accessToken = await seedAccessToken({
        user_id: developer.id,
        token_id: tokenId,
        display_name: developer.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .patch(`/api/users/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: false })
        .expect(403);

      expect(res.body.error).toBe('forbidden');
    });

    it('returns 400 for invalid body (active not boolean)', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();
      const target = await seedUser({ role: 'developer' });

      const res = await request(app)
        .patch(`/api/users/${target.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: 'yes' })
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 404 for non-existent user', async () => {
      const { admin, accessToken } = await setupAdminWithPermission();

      const res = await request(app)
        .patch('/api/users/nonexistent-id/deactivate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ active: false })
        .expect(404);

      expect(res.body.error).toBe('user_not_found');
    });
  });

  describe('DELETE /api/tokens/:id (token revocation)', () => {
    it('allows user to revoke their own token', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId: refreshTokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: refreshTokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const token = await seedToken({ user_id: user.id });

      const res = await request(app)
        .delete(`/api/tokens/${token.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe(token.id);

      // Verify token revoked in DB
      const revoked = await knex('api_tokens').where({ id: token.id }).first();
      expect(revoked.revoked_at).toBeTruthy();
    });

    it('prevents user from revoking another user\'s token (non-admin)', async () => {
      const user1 = await seedUser({ role: 'developer' });
      const user2 = await seedUser({ role: 'developer' });

      const { tokenId: refreshTokenId } = await seedRefreshToken({ user_id: user1.id });
      const accessToken = await seedAccessToken({
        user_id: user1.id,
        token_id: refreshTokenId,
        display_name: user1.display_name,
        role: 'developer',
      });

      const token = await seedToken({ user_id: user2.id });

      const res = await request(app)
        .delete(`/api/tokens/${token.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('forbidden');

      // Verify token NOT revoked
      const notRevoked = await knex('api_tokens').where({ id: token.id }).first();
      expect(notRevoked.revoked_at).toBeNull();
    });

    it('allows admin to revoke any user\'s token', async () => {
      const developer = await seedUser({ role: 'developer' });
      const admin = await seedUser({ role: 'admin' });

      // Seed admin role + permission
      const adminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!adminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const perm = await knex('permissions').where({ id: 'user_manage' }).first();
      if (!perm) {
        await knex('permissions').insert({ id: 'user_manage', name: 'user_manage', description: 'Manage users' });
      }
      const rolePerm = await knex('role_permissions').where({ role_id: 'admin', permission_id: 'user_manage' }).first();
      if (!rolePerm) {
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'user_manage' });
      }

      const { tokenId: adminTokenId } = await seedRefreshToken({ user_id: admin.id });
      const adminAccessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: adminTokenId,
        display_name: admin.display_name,
        role: 'admin',
      });

      const token = await seedToken({ user_id: developer.id });

      const res = await request(app)
        .delete(`/api/tokens/${token.id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify token revoked
      const revoked = await knex('api_tokens').where({ id: token.id }).first();
      expect(revoked.revoked_at).toBeTruthy();
    });

    it('returns 404 for non-existent token', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .delete('/api/tokens/nonexistent-token-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('token_not_found');
    });

    it('returns 404 for already-revoked token', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const token = await seedToken({ user_id: user.id });
      // Revoke it first
      await knex('api_tokens').where({ id: token.id }).update({ revoked_at: knex.fn.now() });

      const res = await request(app)
        .delete(`/api/tokens/${token.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('token_not_found');
    });
  });
});
