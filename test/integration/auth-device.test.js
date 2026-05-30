import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';

describe('Auth: Device Flow (RFC 8628)', () => {
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

  describe('GET /api/auth/device', () => {
    it('issues device_code and user_code', async () => {
      const res = await request(app)
        .get('/api/auth/device')
        .expect(200);

      expect(res.body).toHaveProperty('device_code');
      expect(res.body).toHaveProperty('user_code');
      expect(res.body).toHaveProperty('verification_uri');
      expect(res.body).toHaveProperty('verification_uri_complete');
      expect(res.body).toHaveProperty('expires_in');
      expect(res.body).toHaveProperty('interval');

      // Verify format
      expect(res.body.device_code).toMatch(/^dc_/);
      expect(res.body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(res.body.expires_in).toBe(15 * 60); // 15 minutes
      expect(res.body.interval).toBe(5);
    });

    it('creates a device_code row with pending status', async () => {
      const res = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const row = await knex('device_codes')
        .where({ device_code: res.body.device_code })
        .first();

      expect(row).toBeTruthy();
      expect(row.status).toBe('pending');
      expect(row.user_id).toBeNull();
    });
  });

  describe('POST /activate (device authorization)', () => {
    it('updates device_code to authorized when user signs in and submits user_code', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
        display_name: user.display_name,
      });

      // 1. Get device code
      const deviceRes = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const userCode = deviceRes.body.user_code;

      // 2. User submits code (with Bearer token auth)
      const activateRes = await request(app)
        .post('/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ user_code: userCode })
        .expect(200);

      expect(activateRes.text).toContain('Device Authorized');

      // 3. Verify device_code was updated
      const row = await knex('device_codes')
        .where({ user_code: userCode })
        .first();

      expect(row.status).toBe('authorized');
      expect(row.user_id).toBe(user.id);
    });

    it('rejects if user is not authenticated (no Bearer token)', async () => {
      const deviceRes = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const res = await request(app)
        .post('/activate')
        .send({ user_code: deviceRes.body.user_code })
        .expect(401);

      expect(res.body.error).toContain('Please sign in first');
    });

    it('rejects invalid user_code format', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
      });

      const res = await request(app)
        .post('/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ user_code: 'invalid' })
        .expect(400);

      expect(res.body.error).toBe('Invalid code format.');
    });

    it('rejects non-existent user_code', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
      });

      const res = await request(app)
        .post('/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ user_code: 'XXXX-XXXX' })
        .expect(400);

      expect(res.body.error).toContain('Invalid or expired code');
    });
  });

  describe('POST /api/auth/device/token (token redemption)', () => {
    it('issues refresh_token when device_code is authorized', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
      });

      // 1. Get and authorize device code
      const deviceRes = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const deviceCode = deviceRes.body.device_code;
      const userCode = deviceRes.body.user_code;

      await request(app)
        .post('/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ user_code: userCode })
        .expect(200);

      // 2. Redeem device code for refresh token
      const tokenRes = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: deviceCode })
        .expect(200);

      expect(tokenRes.body).toHaveProperty('refresh_token');
      expect(tokenRes.body).toHaveProperty('user');
      expect(tokenRes.body).toHaveProperty('token_type', 'bearer');
      expect(tokenRes.body.refresh_token).toMatch(/^rt_/);
    });

    it('returns 428 (authorization_pending) when device_code is still pending', async () => {
      const deviceRes = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const res = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: deviceRes.body.device_code })
        .expect(428);

      expect(res.body.error).toBe('authorization_pending');
    });

    it('prevents double-redemption (atomic transaction)', async () => {
      const user = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: user.id });
      const accessToken = await seedAccessToken({
        user_id: user.id,
        token_id: tokenId,
      });

      // 1. Get and authorize device code
      const deviceRes = await request(app)
        .get('/api/auth/device')
        .expect(200);

      const deviceCode = deviceRes.body.device_code;
      const userCode = deviceRes.body.user_code;

      await request(app)
        .post('/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ user_code: userCode })
        .expect(200);

      // 2. First redemption succeeds
      const firstRes = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: deviceCode })
        .expect(200);

      expect(firstRes.body.refresh_token).toBeTruthy();

      // 3. Second redemption attempt fails (device code was already consumed)
      const secondRes = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: deviceCode })
        .expect(400);

      expect(secondRes.body.error).toBe('invalid_device_code');
    });

    it('rejects empty device_code', async () => {
      const res = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: '' })
        .expect(400);

      expect(res.body.error).toBe('missing_device_code');
    });

    it('rejects missing device_code', async () => {
      const res = await request(app)
        .post('/api/auth/device/token')
        .send({})
        .expect(400);

      expect(res.body.error).toBe('missing_device_code');
    });

    it('rejects invalid device_code format', async () => {
      const res = await request(app)
        .post('/api/auth/device/token')
        .send({ device_code: 'invalid_format' })
        .expect(400);

      expect(res.body.error).toBe('invalid_device_code');
    });
  });
});
