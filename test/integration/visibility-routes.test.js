import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import { kv } from '../../src/kv.js';

describe('Session Visibility Routes', () => {
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

  describe('GET /p/:sessionId (serve)', () => {
    it('returns 200 for owner viewing own private plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
      });

      // Create private session via API
      const html = '<html><head><title>Private Plan</title></head><body><h1>Private Plan</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'private-own')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      const res = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.text).toContain('Private Plan');
    });

    it('returns 404 for stranger viewing private plan (not 403)', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Private Plan</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'private-stranger')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Now access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.text).toContain('404');
    });

    it('returns 200 for admin viewing private plan (has session_view_private)', async () => {
      const owner = await seedUser({ role: 'developer' });

      // Ensure admin role and permission exist BEFORE creating admin user
      const existingAdminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!existingAdminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const existingPerm = await knex('permissions').where({ id: 'session_view_private' }).first();
      if (!existingPerm) {
        await knex('permissions').insert({ id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' });
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'session_view_private' });
      }

      // Now create the admin user (seedUser will find the admin role)
      const admin = await seedUser({ role: 'admin' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Private Plan</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'private-admin')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Now access as admin
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
      });

      const res = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.text).toContain('Private Plan');
    });

    it('returns 200 for anyone viewing published plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create published session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Public Plan</title></head><body><h1>Public Plan</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'public-plan')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.text).toContain('Public Plan');
    });
  });

  describe('GET /api/comments?session_id= (comments)', () => {
    it('returns 200 for owner fetching comments from own private plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
      });

      // Create private session via API
      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'comments-private-owner')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      const res = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('comments');
      expect(res.body).toHaveProperty('current_version');
    });

    it('returns 404 for stranger fetching comments from private plan (not 403)', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'comments-private-stranger')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 200 for admin fetching comments from private plan', async () => {
      const owner = await seedUser({ role: 'developer' });

      // Ensure admin role and permission exist BEFORE creating admin user
      const existingAdminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!existingAdminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const existingPerm = await knex('permissions').where({ id: 'session_view_private' }).first();
      if (!existingPerm) {
        await knex('permissions').insert({ id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' });
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'session_view_private' });
      }

      // Now create the admin user (seedUser will find the admin role)
      const admin = await seedUser({ role: 'admin' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'comments-private-admin')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as admin
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
      });

      const res = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('comments');
    });

    it('returns 200 for anyone fetching comments from published plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create published session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Public Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'comments-public-plan')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('comments');
    });
  });

  describe('GET /api/sessions/:id/info (sessionInfo)', () => {
    it('returns 200 for owner fetching info from own private plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
      });

      // Create private session via API
      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'info-private-owner')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('session');
      expect(res.body.session.id).toBe(sessionId);
    });

    it('returns 404 for stranger fetching info from private plan (not 403)', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'info-private-stranger')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 200 for admin fetching info from private plan', async () => {
      const owner = await seedUser({ role: 'developer' });

      // Ensure admin role and permission exist BEFORE creating admin user
      const existingAdminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!existingAdminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const existingPerm = await knex('permissions').where({ id: 'session_view_private' }).first();
      if (!existingPerm) {
        await knex('permissions').insert({ id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' });
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'session_view_private' });
      }

      // Now create the admin user (seedUser will find the admin role)
      const admin = await seedUser({ role: 'admin' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'info-private-admin')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as admin
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
      });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('session');
    });

    it('returns 200 for anyone fetching info from published plan', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create published session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Public Plan</title></head><body><h1>Test</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'info-public-plan')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('session');
    });
  });

  describe('Access control guarantee: 404 not 403 for private session leaks', () => {
    it('private plan returns 404 (not 403) across all three routes', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private</title></head><body><h1>Private</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'access-control-404')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as stranger
      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
      });

      // Test GET /p/:id
      const serveRes = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(serveRes.status).toBe(404);
      expect(serveRes.status).not.toBe(403);

      // Test GET /api/comments
      const commentsRes = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(commentsRes.status).toBe(404);
      expect(commentsRes.status).not.toBe(403);

      // Test GET /api/sessions/:id/info
      const infoRes = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(infoRes.status).toBe(404);
      expect(infoRes.status).not.toBe(403);
    });

    it('private plan returns 200 for owner across all three routes', async () => {
      const owner = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
      });

      // Create private session via API
      const html = '<html><head><title>Private</title></head><body><h1>Private</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'owner-all-routes')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Test GET /p/:id
      const serveRes = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(serveRes.status).toBe(200);

      // Test GET /api/comments
      const commentsRes = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(commentsRes.status).toBe(200);

      // Test GET /api/sessions/:id/info
      const infoRes = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(infoRes.status).toBe(200);
    });

    it('private plan returns 200 for admin across all three routes', async () => {
      const owner = await seedUser({ role: 'developer' });

      // Ensure admin role and permission exist BEFORE creating admin user
      const existingAdminRole = await knex('roles').where({ id: 'admin' }).first();
      if (!existingAdminRole) {
        await knex('roles').insert({ id: 'admin', name: 'admin', description: 'Administrator' });
      }
      const existingPerm = await knex('permissions').where({ id: 'session_view_private' }).first();
      if (!existingPerm) {
        await knex('permissions').insert({ id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' });
        await knex('role_permissions').insert({ role_id: 'admin', permission_id: 'session_view_private' });
      }

      // Now create the admin user (seedUser will find the admin role)
      const admin = await seedUser({ role: 'admin' });

      // Create private session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const html = '<html><head><title>Private</title></head><body><h1>Private</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'admin-all-routes')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Access as admin
      const { tokenId } = await seedRefreshToken({ user_id: admin.id });
      const accessToken = await seedAccessToken({
        user_id: admin.id,
        token_id: tokenId,
        display_name: admin.display_name,
      });

      // Test GET /p/:id
      const serveRes = await request(app)
        .get(`/p/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(serveRes.status).toBe(200);

      // Test GET /api/comments
      const commentsRes = await request(app)
        .get(`/api/comments?session_id=${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(commentsRes.status).toBe(200);

      // Test GET /api/sessions/:id/info
      const infoRes = await request(app)
        .get(`/api/sessions/${sessionId}/info`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(infoRes.status).toBe(200);
    });
  });
});
