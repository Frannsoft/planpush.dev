import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedRefreshToken, seedAccessToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import { kv } from '../../src/kv.js';

describe('Auth: Token Rotation & Replay Detection (CRITICAL SECURITY)', () => {
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

  describe('POST /api/auth/token (refresh token rotation)', () => {
    it('exchanges refresh_token for new refresh_token + access_token', async () => {
      const user = await seedUser({ role: 'developer', display_name: 'Alice' });
      const { refreshToken, familyId } = await seedRefreshToken({ user_id: user.id });

      const res = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('refresh_token');
      expect(res.body).toHaveProperty('token_type', 'bearer');
      expect(res.body).toHaveProperty('expires_in');

      expect(res.body.access_token).toMatch(/^at_/);
      expect(res.body.refresh_token).toMatch(/^rt_/);
      expect(res.body.refresh_token).not.toBe(refreshToken); // New token
      expect(res.body.expires_in).toBe(60 * 60); // 1 hour
    });

    it('stores access_token in KV store with user metadata', async () => {
      const user = await seedUser({ role: 'developer', display_name: 'Bob' });
      const { refreshToken } = await seedRefreshToken({ user_id: user.id });

      const res = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      const accessToken = res.body.access_token;
      const kvData = await kv.get(`access_token:${accessToken}`, 'json');

      expect(kvData).toBeTruthy();
      expect(kvData.user_id).toBe(user.id);
      expect(kvData.display_name).toBe('Bob');
      // Note: The role stored in the token comes from the response handler, which uses the users.role legacy column
      // The user was created with role='member' by default (legacy), not the RBAC role
      expect(kvData.role).toBe('member');
      expect(kvData.token_id).toBeTruthy();
    });

    it('revokes the old refresh_token (mark revoked_at)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { refreshToken, tokenId } = await seedRefreshToken({ user_id: user.id });

      // Get old token's row
      const oldRow = await knex('api_tokens').where({ id: tokenId }).first();
      expect(oldRow.revoked_at).toBeNull();

      // Exchange for new token
      await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      // Check old token is revoked
      const revokedRow = await knex('api_tokens').where({ id: tokenId }).first();
      expect(revokedRow.revoked_at).toBeTruthy();
    });

    it('sets last_used_at when rotating', async () => {
      const user = await seedUser({ role: 'developer' });
      const { refreshToken, tokenId } = await seedRefreshToken({ user_id: user.id });

      const oldRow = await knex('api_tokens').where({ id: tokenId }).first();
      expect(oldRow.last_used_at).toBeNull();

      await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      const newRow = await knex('api_tokens').where({ id: tokenId }).first();
      expect(newRow.last_used_at).toBeTruthy();
    });

    it('rejects refresh_token from deactivated user', async () => {
      const user = await seedUser({
        role: 'developer',
        deactivated_at: new Date().toISOString(),
      });
      const { refreshToken } = await seedRefreshToken({ user_id: user.id });

      const res = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res.body.error).toBe('invalid_refresh_token');
    });

    it('rejects missing refresh_token', async () => {
      const res = await request(app)
        .post('/api/auth/token')
        .send({})
        .expect(400);

      expect(res.body.error).toBe('missing_refresh_token');
    });

    it('rejects invalid refresh_token', async () => {
      const res = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: 'rt_invalid_xyz' })
        .expect(401);

      expect(res.body.error).toBe('invalid_refresh_token');
    });
  });

  describe('CRITICAL: Token replay detection & family revocation', () => {
    it('detects replay of an old refresh_token and revokes entire family', async () => {
      const user = await seedUser({ role: 'developer' });
      const { refreshToken, familyId } = await seedRefreshToken({
        user_id: user.id,
      });

      // 1. First rotation: old token -> new token
      const res1 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(200);

      const newRefreshToken = res1.body.refresh_token;

      // 2. Verify old token is revoked but family still has active tokens
      const oldTokenRow = await knex('api_tokens')
        .where({ family_id: familyId, id: knex.raw(`(select id from api_tokens where family_id = '${familyId}' limit 1)`) })
        .first();

      const activeTokens = await knex('api_tokens')
        .where({ family_id: familyId })
        .whereNull('revoked_at');
      expect(activeTokens.length).toBeGreaterThan(0);

      // 3. Attempt replay with old refresh_token -> MUST revoke entire family
      const res2 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: refreshToken })
        .expect(401);

      expect(res2.body.error).toBe('token_reuse_detected');

      // 4. Verify ENTIRE family is now revoked
      const revokedFamily = await knex('api_tokens')
        .where({ family_id: familyId })
        .whereNull('revoked_at');

      expect(revokedFamily.length).toBe(0); // All tokens in family revoked
    });

    it('revokes entire family when any token in the chain is replayed', async () => {
      const user = await seedUser({ role: 'developer' });
      const { refreshToken: token1, familyId } = await seedRefreshToken({
        user_id: user.id,
      });

      // 1. First rotation: token1 -> token2
      const res1 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token1 })
        .expect(200);

      const token2 = res1.body.refresh_token;

      // 2. Second rotation: token2 -> token3
      const res2 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token2 })
        .expect(200);

      const token3 = res2.body.refresh_token;

      // 3. Now replay token1 (oldest token) -> MUST revoke entire family
      const res3 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token1 })
        .expect(401);

      expect(res3.body.error).toBe('token_reuse_detected');

      // 4. Verify ENTIRE family is revoked
      const revokedFamily = await knex('api_tokens')
        .where({ family_id: familyId })
        .whereNull('revoked_at');

      expect(revokedFamily.length).toBe(0);

      // 5. Attempt to use token3 (the latest token) should also fail with same error
      // (entire family was revoked by the replay detection above)
      const res4 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token3 })
        .expect(401);

      expect(res4.body.error).toBe('token_reuse_detected');
    });

    it('does not revoke family if token rotation is used legitimately (no replay)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { refreshToken: token1, familyId } = await seedRefreshToken({
        user_id: user.id,
      });

      // 1. Rotate token1 -> token2
      const res1 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token1 })
        .expect(200);

      const token2 = res1.body.refresh_token;

      // 2. Rotate token2 -> token3 (legitimate use)
      const res2 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token2 })
        .expect(200);

      const token3 = res2.body.refresh_token;

      // 3. Rotate token3 -> token4
      const res3 = await request(app)
        .post('/api/auth/token')
        .send({ refresh_token: token3 })
        .expect(200);

      expect(res3.body.refresh_token).toBeTruthy();

      // 4. Verify family still has active token (token4)
      const activeTokens = await knex('api_tokens')
        .where({ family_id: familyId })
        .whereNull('revoked_at');

      expect(activeTokens.length).toBe(1); // Only the latest token is active
    });
  });

  describe('Deactivated user check (5-min KV cache behavior)', () => {
    it('returns null from verifyRequest when user is deactivated', async () => {
      const user = await seedUser({
        role: 'developer',
        display_name: 'Charlie',
        deactivated_at: new Date().toISOString(),
      });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(res.body.error).toBe('not_authenticated');
    });

    it('caches deactivated status in KV for 5 minutes', async () => {
      const user = await seedUser({
        role: 'developer',
        display_name: 'Diana',
      });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // 1. First request (active user) -> should succeed
      await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 2. Check KV cache — should have cached '0' (active)
      const cachedActive = await kv.get(`deactivated:${user.id}`);
      expect(cachedActive).toBe('0');

      // 3. Deactivate user in DB
      await knex('users')
        .where({ id: user.id })
        .update({ deactivated_at: new Date().toISOString() });

      // 4. Second request should still succeed (cache hasn't expired)
      await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 5. Clear cache manually (simulating cache expiration)
      await kv.delete(`deactivated:${user.id}`);

      // 6. Third request should now fail (cache expired, DB check happens)
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(res.body.error).toBe('not_authenticated');
    });
  });

  describe('Revoked refresh token check', () => {
    it('returns null from verifyRequest when underlying api_token is revoked', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // 1. Verify request works
      await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 2. Revoke the underlying token
      await knex('api_tokens')
        .where({ id: tokenId })
        .update({ revoked_at: new Date().toISOString() });

      // 3. Access token should no longer work
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(res.body.error).toBe('not_authenticated');
    });
  });
});
