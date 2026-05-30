import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken, seedSession } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('Dashboard Actions (PATCH/POST)', () => {
  let app;

  beforeAll(async () => {
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
    // Seed roles and permissions for RBAC tests
    await knex('roles').insert([
      { id: 'admin', name: 'admin', description: 'Administrator' },
      { id: 'project_manager', name: 'project_manager', description: 'Project Manager' },
      { id: 'developer', name: 'developer', description: 'Developer' },
    ]);
    await knex('permissions').insert([
      { id: 'session_archive', name: 'session_archive', description: 'Archive sessions' },
      { id: 'session_publish', name: 'session_publish', description: 'Publish sessions' },
      { id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' },
    ]);
    await knex('role_permissions').insert([
      { role_id: 'admin', permission_id: 'session_archive' },
      { role_id: 'admin', permission_id: 'session_publish' },
      { role_id: 'admin', permission_id: 'session_view_private' },
      { role_id: 'project_manager', permission_id: 'session_archive' },
      { role_id: 'project_manager', permission_id: 'session_publish' },
      { role_id: 'project_manager', permission_id: 'session_view_private' },
      { role_id: 'developer', permission_id: 'session_archive' },
      { role_id: 'developer', permission_id: 'session_publish' },
    ]);
  });

  describe('PATCH /api/sessions/:id/archive', () => {
    it('allows owner (developer) to archive own session', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: owner.id });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: true })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.archived).toBe(true);

      const updated = await knex('sessions').where({ id: session.id }).first();
      expect(updated.archived_at).toBeTruthy();
    });

    it('allows owner to unarchive session', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      // Create archived session
      const session = await seedSession({ created_by: owner.id, archived_at: new Date().toISOString() });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: false })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.archived).toBe(false);

      const updated = await knex('sessions').where({ id: session.id }).first();
      expect(updated.archived_at).toBeNull();
    });

    it('allows PM (admin-like) to archive any session', async () => {
      const pm = await seedUser({ role: 'project_manager' });
      const owner = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: pm.id });
      const accessToken = await seedAccessToken({
        user_id: pm.id,
        token_id: tokenId,
        display_name: pm.display_name,
        role: 'project_manager',
      });

      const session = await seedSession({ created_by: owner.id });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: true })
        .expect(200);

      expect(res.body.ok).toBe(true);

      const updated = await knex('sessions').where({ id: session.id }).first();
      expect(updated.archived_at).toBeTruthy();
    });

    it('denies developer from archiving another user\'s session', async () => {
      const dev1 = await seedUser({ role: 'developer' });
      const dev2 = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: dev1.id });
      const accessToken = await seedAccessToken({
        user_id: dev1.id,
        token_id: tokenId,
        display_name: dev1.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: dev2.id });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: true })
        .expect(403);

      expect(res.body.error).toBe('forbidden');

      const unchanged = await knex('sessions').where({ id: session.id }).first();
      expect(unchanged.archived_at).toBeNull();
    });

    it('returns 404 for non-existent session', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .patch('/api/sessions/nonexistent-id/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: true })
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 400 for invalid session id', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .patch('/api/sessions/!!!invalid/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: true })
        .expect(400);

      expect(res.body.error).toBe('invalid_session_id');
    });

    it('returns 400 when archived is not a boolean', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: owner.id });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ archived: 'yes' })
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 when archived is missing from body', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: owner.id });

      const res = await request(app)
        .patch(`/api/sessions/${session.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });
  });

  describe('POST /api/sessions/:id/publish', () => {
    it('allows owner to publish own session', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: owner.id, published_at: null });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBe(session.id);

      const updated = await knex('sessions').where({ id: session.id }).first();
      expect(updated.published_at).toBeTruthy();
    });

    it('is idempotent - re-publishing already-published session succeeds', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const publishedAt = new Date().toISOString();
      const session = await seedSession({ created_by: owner.id, published_at: publishedAt });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify it wasn't re-updated (is truly idempotent)
      const unchanged = await knex('sessions').where({ id: session.id }).first();
      expect(unchanged.published_at.toString()).toBe(publishedAt.toString());
    });

    it('allows PM to publish any session', async () => {
      const pm = await seedUser({ role: 'project_manager' });
      const owner = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: pm.id });
      const accessToken = await seedAccessToken({
        user_id: pm.id,
        token_id: tokenId,
        display_name: pm.display_name,
        role: 'project_manager',
      });

      const session = await seedSession({ created_by: owner.id, published_at: null });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ok).toBe(true);

      const updated = await knex('sessions').where({ id: session.id }).first();
      expect(updated.published_at).toBeTruthy();
    });

    it('denies developer from publishing another user\'s session (private returns 404)', async () => {
      const dev1 = await seedUser({ role: 'developer' });
      const dev2 = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: dev1.id });
      const accessToken = await seedAccessToken({
        user_id: dev1.id,
        token_id: tokenId,
        display_name: dev1.display_name,
        role: 'developer',
      });

      // Create private session (published_at: null)
      const session = await seedSession({ created_by: dev2.id, published_at: null });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404); // Private sessions return 404 to prevent existence leaks

      expect(res.body.error).toBe('session_not_found');

      const unchanged = await knex('sessions').where({ id: session.id }).first();
      expect(unchanged.published_at).toBeNull();
    });

    it('returns 404 for non-existent session', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/sessions/nonexistent-id/publish')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 400 for invalid session id', async () => {
      const owner = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: owner.id });
      const accessToken = await seedAccessToken({
        user_id: owner.id,
        token_id: tokenId,
        display_name: owner.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/sessions/!!!invalid/publish')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.error).toBe('invalid_session_id');
    });

    it('returns 404 when trying to publish private session as non-owner', async () => {
      const owner = await seedUser({ role: 'developer' });
      const stranger = await seedUser({ role: 'developer' });

      const { tokenId } = await seedRefreshToken({ user_id: stranger.id });
      const accessToken = await seedAccessToken({
        user_id: stranger.id,
        token_id: tokenId,
        display_name: stranger.display_name,
        role: 'developer',
      });

      // Create private session (published_at: null)
      const session = await seedSession({ created_by: owner.id, published_at: null });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });
  });

  describe('POST /api/dashboard/views', () => {
    it('records session views for valid session ids', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const session1 = await seedSession({ created_by: user.id });
      const session2 = await seedSession({ created_by: user.id });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ session_ids: [session1.id, session2.id] })
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify recorded in DB
      const views = await knex('session_views').where({ user_id: user.id });
      expect(views.length).toBe(2);
      const ids = views.map(v => v.session_id);
      expect(ids).toContain(session1.id);
      expect(ids).toContain(session2.id);
    });

    it('silently ignores invalid session ids (non-fatal FK violation)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const session = await seedSession({ created_by: user.id });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ session_ids: [session.id, 'nonexistent-session', 'another-fake'] })
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Valid session should still be recorded (filters out invalid ones)
      const views = await knex('session_views').where({ user_id: user.id });
      expect(views.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 400 when session_ids is missing', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 when session_ids is not an array', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ session_ids: 'not-an-array' })
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 when session_ids array is empty', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ session_ids: [] })
        .expect(400);

      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 when all session_ids are invalid format', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .post('/api/dashboard/views')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ session_ids: ['!!!invalid', '???bad'] })
        .expect(400);

      expect(res.body.error).toBe('invalid_session_ids');
    });
  });
});
