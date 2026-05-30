import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';

// Regression test for JAZ-351: DELETE /api/tokens/:id must authorize "revoke another
// user's token" via live RBAC (user_manage), NOT the role baked into the session/access
// token at login. A recently-demoted admin whose token still says role:'admin' must NOT
// be able to revoke other users' tokens.
describe('Token revoke authorization uses live RBAC, not stale token role (JAZ-351)', () => {
  let app;

  beforeAll(async () => {
    await knex.raw('PRAGMA foreign_keys = OFF');
    try {
      await knex.raw('DROP TABLE IF EXISTS users_old');
      await knex.raw('DROP TABLE IF EXISTS users_old_restore');
    } catch {
      // ignore migration temp-table cleanup errors
    }
    await knex.raw('PRAGMA foreign_keys = ON');
    app = await getApp();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  // resetDb() truncates the RBAC tables, so re-seed the roles/permissions each test.
  beforeEach(async () => {
    await resetDb();
    await knex('roles').insert([
      { id: 'admin', name: 'admin', description: 'Administrator' },
      { id: 'developer', name: 'developer', description: 'Developer' },
    ]);
    await knex('permissions').insert([
      { id: 'user_manage', name: 'user_manage', description: 'Manage users and roles' },
    ]);
    // Only admin holds user_manage; developer does not.
    await knex('role_permissions').insert([
      { role_id: 'admin', permission_id: 'user_manage' },
    ]);
  });

  // Authenticate `user` via the Bearer at_ path with `staleRole` baked into the KV token.
  async function bearerFor(user, staleRole) {
    const backing = await seedToken({ user_id: user.id });
    const at = await seedAccessToken({ user_id: user.id, token_id: backing.id, role: staleRole });
    return `Bearer ${at}`;
  }

  it('denies a demoted admin (now developer) revoking another user\'s token, even with role:admin still in the token', async () => {
    const attacker = await seedUser({ role: 'developer' }); // real RBAC role lacks user_manage
    const victim = await seedUser({ role: 'developer' });
    const victimToken = await seedToken({ user_id: victim.id });

    const auth = await bearerFor(attacker, 'admin'); // STALE elevated role

    const res = await request(app)
      .delete(`/api/tokens/${victimToken.id}`)
      .set('Authorization', auth);

    expect(res.status).toBe(403);
    const row = await knex('api_tokens').where({ id: victimToken.id }).first();
    expect(row.revoked_at).toBeNull(); // victim's token untouched
  });

  it('allows a developer to revoke their OWN token', async () => {
    const user = await seedUser({ role: 'developer' });
    const ownToken = await seedToken({ user_id: user.id });
    const auth = await bearerFor(user, 'developer');

    const res = await request(app)
      .delete(`/api/tokens/${ownToken.id}`)
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    const row = await knex('api_tokens').where({ id: ownToken.id }).first();
    expect(row.revoked_at).not.toBeNull();
  });

  it('allows a real admin (holds user_manage) to revoke any user\'s token', async () => {
    const admin = await seedUser({ role: 'admin' });
    const victim = await seedUser({ role: 'developer' });
    const victimToken = await seedToken({ user_id: victim.id });
    const auth = await bearerFor(admin, 'admin');

    const res = await request(app)
      .delete(`/api/tokens/${victimToken.id}`)
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    const row = await knex('api_tokens').where({ id: victimToken.id }).first();
    expect(row.revoked_at).not.toBeNull();
  });
});
