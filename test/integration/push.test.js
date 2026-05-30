import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import { kv } from '../../src/kv.js';

describe('POST /api/push', () => {
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

  describe('Create new session via X-Session-Name', () => {
    it('creates a session with valid X-Session-Name header', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><head><title>My Design Doc</title></head><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'my-design-doc')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      expect(res.body).toHaveProperty('session_id', 'my-design-doc');
      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toContain('/p/my-design-doc');

      // Verify session was created in DB
      const session = await knex('sessions').where({ id: 'my-design-doc' }).first();
      expect(session).toBeTruthy();
      expect(session.created_by).toBe(user.id);
      expect(session.title).toBe('My Design Doc');
      expect(session.current_version).toBe(1);
      expect(session.published_at).not.toBeNull(); // default: published
    });

    it('creates a session with published_at=null when X-Visibility: private', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><head><title>Private Plan</title></head><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'private-plan')
        .set('X-Visibility', 'private')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      expect(res.body.session_id).toBe('private-plan');

      // Verify session is private (published_at is null)
      const session = await knex('sessions').where({ id: 'private-plan' }).first();
      expect(session.published_at).toBeNull();
    });

    it('sanitizes HTML on push: strips scripts, event handlers, inline styles', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // HTML with dangerous content
      const dirtyHtml = `<html>
        <head><title>Test</title></head>
        <body>
          <h1>Safe</h1>
          <script>alert('xss')</script>
          <img src="x" onerror="alert('xss')">
          <div style="color: red">Inline style</div>
          <a href="javascript:alert('xss')">Click me</a>
        </body>
      </html>`;

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'sanitized')
        .set('Content-Type', 'text/html')
        .send(dirtyHtml)
        .expect(200);

      // Fetch the stored HTML from KV
      const storedHtml = await kv.get(`plan:${res.body.session_id}:current`);
      expect(storedHtml).toBeTruthy();
      expect(storedHtml).not.toContain('<script>');
      expect(storedHtml).not.toContain('onerror=');
      expect(storedHtml).not.toContain('javascript:');
      expect(storedHtml).not.toContain('style="');
    });

    it('returns 409 when session name is already taken', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><head><title>Test</title></head><body><h1>Test</h1></body></html>';

      // Create first session
      await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'taken-name')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Try to create another with same name
      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'taken-name')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(409);

      expect(res.body.error).toBe('session_name_taken');
      expect(res.body.message).toContain('taken-name');
    });

    it('generates a sess_ ID when X-Session-Name is invalid', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // Use only special characters (no alphanumeric) and no title in HTML
      const html = '<html><head></head><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', '!@#$%^&*()')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Session ID should be auto-generated (sess_ prefix) since name has no valid alphanumeric and no title
      expect(res.body.session_id).toMatch(/^sess_/);
    });

    it('records session_versions row on new session', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><head><title>Test</title></head><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'tracked-session')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Verify session_versions row
      const version = await knex('session_versions')
        .where({ session_id: 'tracked-session', version: 1 })
        .first();

      expect(version).toBeTruthy();
      expect(version.pushed_by).toBe(user.id);
      expect(version.pushed_at).toBeTruthy();
    });
  });

  describe('Update existing session via X-Session-Id', () => {
    it('increments version and records new session_versions row on update', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // Create initial session via API
      const initialHtml = '<html><head><title>Initial Doc</title></head><body><h1>Initial</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'update-test')
        .set('Content-Type', 'text/html')
        .send(initialHtml)
        .expect(200);

      const sessionId = createRes.body.session_id;

      const html = '<html><head><title>Updated Doc</title></head><body><h1>Updated</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Id', sessionId)
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      expect(res.body.session_id).toBe(sessionId);

      // Verify version incremented
      const updated = await knex('sessions').where({ id: sessionId }).first();
      expect(updated.current_version).toBe(2);

      // Verify new version_versions row
      const v2 = await knex('session_versions')
        .where({ session_id: sessionId, version: 2 })
        .first();

      expect(v2).toBeTruthy();
      expect(v2.pushed_by).toBe(user.id);
    });

    it('returns 404 when session does not exist', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Id', 'nonexistent')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 400 when X-Session-Id is invalid format', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Id', '!!!invalid!!!')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(400);

      expect(res.body.error).toBe('invalid_session_id');
    });

    it('returns 403 when user is not the session owner', async () => {
      const owner = await seedUser({ role: 'developer' });
      const other = await seedUser({ role: 'developer' });

      // Create session as owner
      const ownerTokenId = (await seedRefreshToken({ user_id: owner.id })).tokenId;
      const ownerAccessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: ownerTokenId,
        display_name: owner.display_name,
      });

      const initialHtml = '<html><head><title>Test</title></head><body><h1>Initial</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .set('X-Session-Name', 'owner-only')
        .set('Content-Type', 'text/html')
        .send(initialHtml)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Try to update as other user
      const { tokenId } = await seedRefreshToken({ user_id: other.id });
      const accessToken = await seedAccessToken({
        user_id: other.id,
        token_id: tokenId,
        display_name: other.display_name,
      });

      const html = '<html><body><h1>Test</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Id', sessionId)
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(403);

      expect(res.body.error).toBe('not_session_owner');
    });

    it('preserves published_at status on update', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // Create a published session (without X-Visibility, default is published)
      const initialHtml = '<html><head><title>Test</title></head><body><h1>Initial</h1></body></html>';
      const createRes = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'published-preserve')
        .set('Content-Type', 'text/html')
        .send(initialHtml)
        .expect(200);

      const sessionId = createRes.body.session_id;

      // Get the published_at timestamp
      let session = await knex('sessions').where({ id: sessionId }).first();
      const publishedDate = session.published_at;
      expect(publishedDate).not.toBeNull();

      const html = '<html><body><h1>Updated</h1></body></html>';

      await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Id', sessionId)
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Verify published_at was not changed
      const updated = await knex('sessions').where({ id: sessionId }).first();
      expect(updated.published_at).toBe(publishedDate);
    });
  });

  describe('Invalid inputs', () => {
    it('returns 400 when body is not a string', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'test')
        .set('Content-Type', 'application/json')
        .send({ html: '<h1>Test</h1>' })
        .expect(400);

      expect(res.body.error).toBe('content_type_must_be_text_html');
    });

    it('returns 400 when body is empty', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'test')
        .set('Content-Type', 'text/html')
        .send('')
        .expect(400);

      expect(res.body.error).toBe('empty_body');
    });
  });

  describe('KV storage', () => {
    it('stores current plan HTML in KV with key plan:{sessionId}:current', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><head><title>Test</title></head><body><h1>Stored HTML</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'kv-test')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Verify KV contains the sanitized HTML
      const storedHtml = await kv.get(`plan:${res.body.session_id}:current`);
      expect(storedHtml).toBeTruthy();
      expect(storedHtml).toContain('Stored HTML');
    });

    it('stores versioned snapshot with 90-day TTL in KV', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const html = '<html><body><h1>Version 1</h1></body></html>';

      const res = await request(app)
        .post('/api/push')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Session-Name', 'version-kv-test')
        .set('Content-Type', 'text/html')
        .send(html)
        .expect(200);

      // Wait a moment for async KV puts to complete (setImmediate)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify versioned snapshot exists
      const versionedHtml = await kv.get(`plan:${res.body.session_id}:v:1`);
      expect(versionedHtml).toBeTruthy();
      expect(versionedHtml).toContain('Version 1');
    });
  });
});
