import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken, seedSession } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('Comments Integration', () => {
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

  describe('POST /api/comments', () => {
    it('creates a comment with valid content and anchor', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'This is a test comment',
          anchor: 'section-1',
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.content).toBe('This is a test comment');
      expect(res.body.anchor).toBe('section-1');
      expect(res.body.resolved).toBe(0);
      expect(res.body.author_display_name).toBe(user.display_name);
    });

    it('creates a comment without anchor', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Comment without anchor',
        })
        .expect(201);

      expect(res.body.anchor).toBeNull();
    });

    it('rejects comment with content > 4000 chars', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const longContent = 'a'.repeat(4001);

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: longContent,
        })
        .expect(400);

      expect(res.body.error).toBe('comment_too_long');
      expect(res.body.max).toBe(4000);
    });

    it('accepts comment with content exactly 4000 chars', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const content = 'a'.repeat(4000);

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content,
        })
        .expect(201);

      expect(res.body.content).toBe(content);
    });

    it('rejects anchor > 200 chars', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const anchor = 'a'.repeat(201);

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Test comment',
          anchor,
        })
        .expect(400);

      expect(res.body.error).toBe('anchor_too_long');
      expect(res.body.max).toBe(200);
    });

    it('accepts anchor exactly 200 chars', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const anchor = 'a'.repeat(200);

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Test comment',
          anchor,
        })
        .expect(201);

      expect(res.body.anchor).toBe(anchor);
    });

    it('rejects non-string content', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 123,
        })
        .expect(400);

      expect(res.body.error).toBe('invalid_content');
    });

    it('rejects request with missing session_id or content', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: 'sess_123',
        })
        .expect(400);

      expect(res.body.error).toBe('missing_fields');
    });

    it('returns 404 for non-existent session', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: 'sess_000000000000',
          content: 'Test comment',
        })
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 404 for deleted session (visibility check)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });
      // Soft-delete the session
      await knex('sessions').where({ id: session.id }).update({ deleted_at: knex.fn.now() });

      const res = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Test comment',
        })
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });
  });

  describe('GET /api/comments', () => {
    it('retrieves all comments for a session', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      // Create a few comments
      await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'First comment',
        })
        .expect(201);

      await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Second comment',
          anchor: 'sec2',
        })
        .expect(201);

      const res = await request(app)
        .get('/api/comments')
        .query({ session_id: session.id })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.comments).toHaveLength(2);
      expect(res.body.comments[0].content).toBe('First comment');
      expect(res.body.comments[1].content).toBe('Second comment');
      expect(res.body.comments[1].anchor).toBe('sec2');
      expect(res.body.current_version).toBe(session.current_version);
    });

    it('returns empty array for session with no comments', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const res = await request(app)
        .get('/api/comments')
        .query({ session_id: session.id })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.comments).toEqual([]);
    });

    it('returns 404 for non-existent session', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .get('/api/comments')
        .query({ session_id: 'sess_111111111111' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 400 for invalid session_id', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .get('/api/comments')
        .query({ session_id: 'invalid$id' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.error).toBe('invalid_session_id');
    });
  });

  describe('PATCH /api/comments/:id/resolve', () => {
    it('allows author to resolve their own comment', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const session = await seedSession({ created_by: user.id });

      const createRes = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          session_id: session.id,
          content: 'Test comment',
        })
        .expect(201);

      const commentId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/comments/${commentId}/resolve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.resolved).toBe(1);

      // Verify in DB
      const comment = await knex('comments').where({ id: commentId }).first();
      expect(comment.resolved).toBe(1);
      expect(comment.resolved_at).toBeTruthy();
    });

    it('rejects resolve attempt by non-author', async () => {
      const author = await seedUser({ role: 'developer' });
      const other = await seedUser({ role: 'developer' });

      const { tokenId: authorTokenId } = await seedRefreshToken({ user_id: author.id });
      const authorAccessToken = await seedAccessToken({
        user_id: author.id,
        token_id: authorTokenId,
        display_name: author.display_name,
      });

      const { tokenId: otherTokenId } = await seedRefreshToken({ user_id: other.id });
      const otherAccessToken = await seedAccessToken({
        user_id: other.id,
        token_id: otherTokenId,
        display_name: other.display_name,
      });

      const session = await seedSession({ created_by: author.id });

      const createRes = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authorAccessToken}`)
        .send({
          session_id: session.id,
          content: 'Author comment',
        })
        .expect(201);

      const commentId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/comments/${commentId}/resolve`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(403);

      expect(res.body.error).toBe('only_author_can_resolve');

      // Verify comment still unresolved
      const comment = await knex('comments').where({ id: commentId }).first();
      expect(comment.resolved).toBe(0);
    });

    it('returns 404 for non-existent comment', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .patch('/api/comments/nonexistent-id/resolve')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('comment_not_found');
    });

    it('returns 400 when comment_id missing', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      const res = await request(app)
        .patch('/api/comments//resolve')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
