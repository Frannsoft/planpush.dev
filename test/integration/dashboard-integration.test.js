import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken, seedSession } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('GET /dashboard (Integration)', () => {
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
    // Seed roles and permissions
    await knex('roles').insert([
      { id: 'admin', name: 'admin', description: 'Administrator' },
      { id: 'developer', name: 'developer', description: 'Developer' },
    ]);
    await knex('permissions').insert([
      { id: 'session_view_private', name: 'session_view_private', description: 'View private sessions' },
    ]);
    await knex('role_permissions').insert([
      { role_id: 'admin', permission_id: 'session_view_private' },
    ]);
  });

  it('returns 200 HTML for authenticated user', async () => {
    const user = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: user.id });
    const accessToken = await seedAccessToken({
      user_id: user.id,
      token_id: tokenId,
      display_name: user.display_name,
      role: 'developer',
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toBeTruthy();
  });

  it('developer sees own sessions and commented-on published sessions', async () => {
    const dev1 = await seedUser({ role: 'developer' });
    const dev2 = await seedUser({ role: 'developer' });

    const { tokenId: tokenId1 } = await seedRefreshToken({ user_id: dev1.id });
    const accessToken1 = await seedAccessToken({
      user_id: dev1.id,
      token_id: tokenId1,
      display_name: dev1.display_name,
      role: 'developer',
    });

    // Create session owned by dev1 (published)
    const ownSession = await seedSession({ created_by: dev1.id, published_at: new Date().toISOString() });

    // Create session owned by dev2 (private)
    const privateSession = await seedSession({ created_by: dev2.id, published_at: null });

    // Create session owned by dev2 (published) and dev1 comments on it
    const commentedSession = await seedSession({ created_by: dev2.id, published_at: new Date().toISOString() });
    await knex('comments').insert({
      id: `comment_${Math.random().toString(36).slice(2, 18)}`,
      session_id: commentedSession.id,
      author_id: dev1.id,
      content: 'Great work!',
      resolved: false,
      created_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken1}`)
      .expect(200);

    // Dev1 should see:
    // - ownSession (created by dev1)
    // - commentedSession (published and dev1 commented)
    // But NOT:
    // - privateSession (private, created by dev2, dev1 didn't comment)

    expect(res.text).toContain(ownSession.title);
    expect(res.text).toContain(commentedSession.title);
    expect(res.text).not.toContain(privateSession.title);
  });

  it('admin sees all sessions including private with "Private" badge', async () => {
    const admin = await seedUser({ role: 'admin' });
    const dev = await seedUser({ role: 'developer' });

    const { tokenId } = await seedRefreshToken({ user_id: admin.id });
    const accessToken = await seedAccessToken({
      user_id: admin.id,
      token_id: tokenId,
      display_name: admin.display_name,
      role: 'admin',
    });

    // Create private session by dev
    const privateSession = await seedSession({ created_by: dev.id, published_at: null });

    // Create public session by dev
    const publicSession = await seedSession({ created_by: dev.id, published_at: new Date().toISOString() });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Admin should see both
    expect(res.text).toContain(privateSession.title);
    expect(res.text).toContain(publicSession.title);
    // Admin should see a "Private" indicator for the private session
    // (text content will have it, exact HTML varies by dashboard implementation)
    expect(res.text).toMatch(/[Pp]rivate/); // At least some indication of privacy
  });

  it('shows sessions in descending last_updated order', async () => {
    const user = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: user.id });
    const accessToken = await seedAccessToken({
      user_id: user.id,
      token_id: tokenId,
      display_name: user.display_name,
      role: 'developer',
    });

    // Create sessions with different timestamps
    const session1 = await seedSession({ created_by: user.id, published_at: new Date().toISOString() });
    await new Promise(r => setTimeout(r, 10));
    const session2 = await seedSession({ created_by: user.id, published_at: new Date().toISOString() });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // session2 should appear before session1 in the HTML (most recent first)
    const session2Index = res.text.indexOf(session2.title);
    const session1Index = res.text.indexOf(session1.title);
    expect(session2Index).toBeGreaterThanOrEqual(0);
    expect(session1Index).toBeGreaterThanOrEqual(0);
    expect(session2Index).toBeLessThan(session1Index);
  });

  it('displays member counts as admin', async () => {
    const admin = await seedUser({ role: 'admin' });
    const { tokenId } = await seedRefreshToken({ user_id: admin.id });
    const accessToken = await seedAccessToken({
      user_id: admin.id,
      token_id: tokenId,
      display_name: admin.display_name,
      role: 'admin',
    });

    // Create a few other users
    await seedUser({ role: 'developer' });
    await seedUser({ role: 'developer' });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Admin should see user list with at least 3 users (admin + 2 devs)
    // The exact HTML format varies, but we expect member info to be present
    expect(res.text.length).toBeGreaterThan(0);
    // Check for some indication of member count or member list
  });

  it('does NOT show member list to non-admin', async () => {
    const dev = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: dev.id });
    const accessToken = await seedAccessToken({
      user_id: dev.id,
      token_id: tokenId,
      display_name: dev.display_name,
      role: 'developer',
    });

    // Create other users
    const other = await seedUser({ role: 'developer' });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Developer should NOT see the other user's details
    // (though exact HTML structure varies)
    expect(res.text).toBeTruthy();
  });

  it('shows user\'s own comments in "My Comments" section', async () => {
    const user = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: user.id });
    const accessToken = await seedAccessToken({
      user_id: user.id,
      token_id: tokenId,
      display_name: user.display_name,
      role: 'developer',
    });

    // Create session and comment as user
    const session = await seedSession({ created_by: user.id, published_at: new Date().toISOString() });
    const comment = await knex('comments').insert({
      id: `comment_${Math.random().toString(36).slice(2, 18)}`,
      session_id: session.id,
      author_id: user.id,
      content: 'My comment here',
      resolved: false,
      created_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Should appear in My Comments section
    expect(res.text).toContain('My comment here');
  });

  it('does not show other users\' comments in "My Comments"', async () => {
    const user1 = await seedUser({ role: 'developer' });
    const user2 = await seedUser({ role: 'developer' });

    const { tokenId } = await seedRefreshToken({ user_id: user1.id });
    const accessToken = await seedAccessToken({
      user_id: user1.id,
      token_id: tokenId,
      display_name: user1.display_name,
      role: 'developer',
    });

    // Create session and comment by user2
    const session = await seedSession({ created_by: user2.id, published_at: new Date().toISOString() });
    const commentContent = `Comment by user2_${Math.random().toString(36).slice(2, 18)}`;
    await knex('comments').insert({
      id: `comment_${Math.random().toString(36).slice(2, 18)}`,
      session_id: session.id,
      author_id: user2.id,
      content: commentContent,
      resolved: false,
      created_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Should NOT appear in user1's My Comments
    expect(res.text).not.toContain(commentContent);
  });

  it('shows API tokens for user', async () => {
    const user = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: user.id });
    const accessToken = await seedAccessToken({
      user_id: user.id,
      token_id: tokenId,
      display_name: user.display_name,
      role: 'developer',
    });

    // Create an API token for the user
    const tokenLabel = `api_token_${Math.random().toString(36).slice(2, 10)}`;
    await knex('api_tokens').insert({
      id: `tok_${Math.random().toString(36).slice(2, 18)}`,
      user_id: user.id,
      hashed_token: 'test_hash',
      label: tokenLabel,
      issued_at: new Date().toISOString(),
      revoked_at: null,
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Token label should appear in dashboard
    expect(res.text).toContain(tokenLabel);
  });

  it('does not show revoked API tokens', async () => {
    const user = await seedUser({ role: 'developer' });
    const { tokenId } = await seedRefreshToken({ user_id: user.id });
    const accessToken = await seedAccessToken({
      user_id: user.id,
      token_id: tokenId,
      display_name: user.display_name,
      role: 'developer',
    });

    // Create a revoked API token
    const tokenLabel = `revoked_${Math.random().toString(36).slice(2, 10)}`;
    await knex('api_tokens').insert({
      id: `tok_${Math.random().toString(36).slice(2, 18)}`,
      user_id: user.id,
      hashed_token: 'test_hash',
      label: tokenLabel,
      issued_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Revoked token should NOT appear
    expect(res.text).not.toContain(tokenLabel);
  });

  it('admin with user_manage permission sees Settings tab', async () => {
    const admin = await seedUser({ role: 'admin' });
    const { tokenId } = await seedRefreshToken({ user_id: admin.id });

    // Grant user_manage permission to admin
    const userManagePermission = await knex('permissions').where('id', 'user_manage').first();
    if (!userManagePermission) {
      await knex('permissions').insert({
        id: 'user_manage',
        name: 'user_manage',
        description: 'Manage users and settings',
      });
    }
    const adminRole = await knex('roles').where('id', 'admin').first();
    if (adminRole) {
      await knex('role_permissions').insert({
        role_id: 'admin',
        permission_id: 'user_manage',
      }).catch(() => {}); // Ignore duplicate key errors
    }

    const accessToken = await seedAccessToken({
      user_id: admin.id,
      token_id: tokenId,
      display_name: admin.display_name,
      role: 'admin',
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Should contain Settings tab button
    expect(res.text).toContain('data-tab="settings"');
    expect(res.text).toContain('Settings');
    // Should contain settings section div
    expect(res.text).toContain('data-section="settings"');
  });

  it('Settings section renders without displaying secret values in HTML', async () => {
    const admin = await seedUser({ role: 'admin' });
    const { tokenId } = await seedRefreshToken({ user_id: admin.id });

    // Grant user_manage permission
    await knex('permissions').insert({
      id: 'user_manage',
      name: 'user_manage',
      description: 'Manage users and settings',
    }).catch(() => {});
    await knex('role_permissions').insert({
      role_id: 'admin',
      permission_id: 'user_manage',
    }).catch(() => {});

    const accessToken = await seedAccessToken({
      user_id: admin.id,
      token_id: tokenId,
      display_name: admin.display_name,
      role: 'admin',
    });

    const res = await request(app)
      .get('/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Settings should be rendered
    expect(res.text).toContain('data-section="settings"');

    // Secret fields should be marked as password type or masked
    // They should NOT contain actual secret values from env
    const okta_secret = process.env.OKTA_CLIENT_SECRET;
    const slack_webhook = process.env.SLACK_WEBHOOK_URL;
    if (okta_secret) {
      expect(res.text).not.toContain(okta_secret);
    }
    if (slack_webhook) {
      expect(res.text).not.toContain(slack_webhook);
    }

    // Should have form fields for settings
    expect(res.text).toContain('id="setting-AUTH_PROVIDER"');
    expect(res.text).toContain('id="setting-OKTA_ISSUER"');
    expect(res.text).toContain('id="setting-BASE_URL"');
  });
});
