import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import { signSession, verifySession } from '../../src/middleware/auth.js';

describe('Auth: Session (CSRF & OAuth state)', () => {
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

  describe('signSession/verifySession (OAuth CSRF state)', () => {
    it('signSession creates a valid signed token', () => {
      const payload = { redirect_to: '/dashboard', nonce: 'abc123', activate: false };
      const token = signSession(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token).toContain('.');
    });

    it('verifySession decodes a valid signed token', () => {
      const payload = { redirect_to: '/dashboard', nonce: 'test-nonce-123', activate: false };
      const token = signSession(payload);

      const decoded = verifySession(token);
      expect(decoded).toBeTruthy();
      expect(decoded.redirect_to).toBe('/dashboard');
      expect(decoded.nonce).toBe('test-nonce-123');
      expect(decoded.activate).toBe(false);
    });

    it('verifySession rejects a tampered signature', () => {
      const payload = { redirect_to: '/dashboard', nonce: 'abc123' };
      const token = signSession(payload);

      // Tamper with the signature part (last part after the dot)
      const parts = token.split('.');
      const tampered = parts[0] + '.invalidsignature';

      const decoded = verifySession(tampered);
      expect(decoded).toBeNull();
    });

    it('verifySession rejects an expired token', () => {
      const payload = { redirect_to: '/dashboard', nonce: 'abc123', exp: Math.floor(Date.now() / 1000) - 10 }; // 10 seconds ago
      const token = signSession(payload);

      const decoded = verifySession(token);
      expect(decoded).toBeNull();
    });

    it('verifySession accepts a non-expired token with exp field', () => {
      const payload = { redirect_to: '/dashboard', nonce: 'abc123', exp: Math.floor(Date.now() / 1000) + 3600 }; // 1 hour from now
      const token = signSession(payload);

      const decoded = verifySession(token);
      expect(decoded).toBeTruthy();
      expect(decoded.redirect_to).toBe('/dashboard');
    });

    it('verifySession returns null for invalid/empty input', () => {
      expect(verifySession('')).toBeNull();
      expect(verifySession(null)).toBeNull();
      expect(verifySession('invalid')).toBeNull();
      expect(verifySession('invalid.invalid')).toBeNull();
    });
  });

  describe('requireAuth middleware', () => {
    it('returns 401 when no authentication provided', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .expect(401);

      expect(res.body.error).toBe('not_authenticated');
    });

    it('returns 200 with token data when valid Bearer access token provided', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.user_id).toBe(user.id);
      expect(res.body.display_name).toBe(user.display_name);
      expect(res.body.role).toBe('developer');
    });

    it('returns 401 when Bearer token is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer at_invalid_token_xyz')
        .expect(401);

      expect(res.body.error).toBe('not_authenticated');
    });
  });

  describe('requireAdmin middleware', () => {
    it('returns 403 when user lacks user_manage permission (developer role)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      // Test against DELETE /api/sessions/:id which requires admin middleware
      const res = await request(app)
        .delete('/api/sessions/test-session-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('forbidden');
    });

    it('rejects when admin user lacks user_manage permission (role not in role_permissions)', async () => {
      const user = await seedUser({ role: 'admin' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'admin',
      });

      // Even though user has 'admin' role, if the role doesn't have user_manage permission
      // in role_permissions table, requireAdmin will reject it
      const res = await request(app)
        .delete('/api/sessions/test-session-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('forbidden');
    });
  });
});
