import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getApp } from '../helpers/app.js';
import { resetDb, seedUser, seedAccessToken, seedRefreshToken } from '../helpers/db.js';
import { knex } from '../../src/db.js';
import dns from 'node:dns/promises';

// The test-connection SSRF guard resolves the issuer host before fetching.
// Real hostnames (e.g. tenant.okta.com) don't resolve in CI, so mock DNS:
// default → a public IP; individual tests override for private-address cases.
vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) },
  };
});

describe('Settings API (/api/admin/settings)', () => {
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
  });

  async function seedAdmin() {
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

  describe('GET /api/admin/settings', () => {
    it('returns all settings (secrets as {isSet: bool})', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('settings');
      expect(Array.isArray(res.body.settings)).toBe(true);

      const settings = res.body.settings;
      const secretSettings = settings.filter(s => s.isSecret);
      const nonSecretSettings = settings.filter(s => !s.isSecret);

      // Check secret settings are masked
      secretSettings.forEach(s => {
        expect(s.value).toEqual({ isSet: expect.any(Boolean) });
        expect(typeof s.value.isSet).toBe('boolean');
      });

      // Non-secret settings should have actual values (or null)
      nonSecretSettings.forEach(s => {
        expect(typeof s.value === 'string' || s.value === null).toBe(true);
      });

      // All should have metadata
      settings.forEach(s => {
        expect(s).toHaveProperty('key');
        expect(s).toHaveProperty('isSet');
        expect(s).toHaveProperty('isLocked');
        expect(s).toHaveProperty('isSecret');
      });
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .get('/api/admin/settings')
        .expect(401);

      expect(res.body.error).toBe('unauthorized');
    });

    it('returns 403 without user_manage permission', async () => {
      const developer = await seedUser({ role: 'developer' });
      const { tokenId } = await seedRefreshToken({ user_id: developer.id });
      const accessToken = await seedAccessToken({
        user_id: developer.id,
        token_id: tokenId,
        display_name: developer.display_name,
        role: 'developer',
      });

      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('forbidden');
    });
  });

  describe('PATCH /api/admin/settings', () => {
    it('updates non-secret settings', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T123/B456/xyz',
            INITIAL_ADMIN_EMAILS: 'admin@example.com,ops@example.com',
          },
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      // Every setting is hydrated into process.env at startup, so any change
      // requires a restart to take effect.
      expect(res.body.restartRequired).toBe(true);

      // Verify in DB
      const webhookRow = await knex('settings').where({ key: 'SLACK_WEBHOOK_URL' }).first();
      expect(webhookRow.value).toBe('https://hooks.slack.com/services/T123/B456/xyz');
      expect(webhookRow.is_secret).toBe(0);

      const emailsRow = await knex('settings').where({ key: 'INITIAL_ADMIN_EMAILS' }).first();
      expect(emailsRow.value).toBe('admin@example.com,ops@example.com');
    });

    it('encrypts secret settings', async () => {
      const { accessToken } = await seedAdmin();

      const secretValue = 'my-scim-token-12345';
      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            SCIM_AUTH_TOKEN: secretValue,
          },
        })
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify in DB: should be encrypted
      const row = await knex('settings').where({ key: 'SCIM_AUTH_TOKEN' }).first();
      expect(row.is_secret).toBe(1);
      expect(row.value).not.toBe(secretValue); // Should be encrypted
      expect(row.value).toContain('{'); // JSON format

      // Verify it's not exposed via GET
      const getRes = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const scimSetting = getRes.body.settings.find(s => s.key === 'SCIM_AUTH_TOKEN');
      expect(scimSetting.value).toEqual({ isSet: true });
      expect(scimSetting.value).not.toHaveProperty('plaintext');
    });

    it('marks routing fields as restart-required', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            AUTH_PROVIDER: 'okta',
          },
        })
        .expect(200);

      expect(res.body.restartRequired).toBe(true);
      expect(res.body.message).toContain('restart');
    });

    it('marks Okta issuer changes as restart-required', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            OKTA_ISSUER: 'https://tenant.okta.com',
          },
        })
        .expect(200);

      expect(res.body.restartRequired).toBe(true);
    });

    it('rejects update for env-locked settings', async () => {
      // Set BASE_URL in env to lock it
      const originalBaseUrl = process.env.BASE_URL;
      process.env.BASE_URL = 'https://locked.example.com';

      try {
        const { accessToken } = await seedAdmin();

        const res = await request(app)
          .patch('/api/admin/settings')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            updates: {
              BASE_URL: 'https://new.example.com',
            },
          })
          .expect(409);

        expect(res.body.error).toContain('locked');
      } finally {
        process.env.BASE_URL = originalBaseUrl;
      }
    });

    it('validates AUTH_PROVIDER values', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            AUTH_PROVIDER: 'invalid',
          },
        })
        .expect(400);

      expect(res.body.error).toContain('AUTH_PROVIDER must be');
    });

    it('rejects unknown settings', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            UNKNOWN_SETTING: 'value',
          },
        })
        .expect(400);

      expect(res.body.error).toContain('Unknown setting');
    });

    it('writes audit log with redacted secrets', async () => {
      const { admin, accessToken } = await seedAdmin();

      await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          updates: {
            SCIM_AUTH_TOKEN: 'secret-value-123',
            SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T123/B456/xyz',
          },
        })
        .expect(200);

      // Check audit log
      const auditLogs = await knex('audit_log')
        .where({ action: 'settings_update' })
        .orderBy('id', 'desc')
        .first();

      expect(auditLogs).toBeTruthy();
      const meta = JSON.parse(auditLogs.meta);
      expect(meta.SCIM_AUTH_TOKEN).toBe('[redacted]');
      expect(meta.SLACK_WEBHOOK_URL).toBe('https://hooks.slack.com/services/T123/B456/xyz');
    });
  });

  describe('POST /api/admin/settings/test-connection', () => {
    it('tests Okta issuer connectivity', async () => {
      const { accessToken } = await seedAdmin();

      // Mock fetch to return valid response
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              issuer: 'https://tenant.okta.com',
              authorization_endpoint: 'https://tenant.okta.com/oauth2/v1/authorize',
            }),
        })
      );

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          issuer: 'https://tenant.okta.com',
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.issuer).toBe('https://tenant.okta.com');
      expect(res.body.authorizationEndpoint).toBeTruthy();
    });

    it('rejects non-HTTPS issuer', async () => {
      const { accessToken } = await seedAdmin();

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          issuer: 'http://insecure.okta.com',
        })
        .expect(400);

      expect(res.body.error).toContain('HTTPS');
    });

    it('handles connection timeout', async () => {
      const { accessToken } = await seedAdmin();

      // Mock fetch to timeout
      global.fetch = vi.fn(() => {
        const controller = { signal: { aborted: false } };
        setTimeout(() => (controller.signal.aborted = true), 10);
        return new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error('Abort');
            err.name = 'AbortError';
            reject(err);
          }, 100);
        });
      });

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          issuer: 'https://timeout.okta.com',
        })
        .expect(408);

      expect(res.body.error).toContain('timeout');
    });

    it('handles invalid OpenID configuration', async () => {
      const { accessToken } = await seedAdmin();

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}), // Missing required fields
        })
      );

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          issuer: 'https://tenant.okta.com',
        })
        .expect(400);

      expect(res.body.error).toContain('Invalid OpenID configuration');
    });

    it('blocks an issuer that resolves to a private/loopback address (SSRF guard)', async () => {
      const { accessToken } = await seedAdmin();
      dns.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
      global.fetch = vi.fn(() => { throw new Error('fetch must not be called for a blocked address'); });

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ issuer: 'https://internal.evil.example' })
        .expect(400);

      expect(res.body.error).toContain('disallowed address');
    });

    it('blocks an issuer pointing at the cloud-metadata IP (169.254.169.254)', async () => {
      const { accessToken } = await seedAdmin();
      dns.lookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);

      const res = await request(app)
        .post('/api/admin/settings/test-connection')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ issuer: 'https://metadata.example' })
        .expect(400);

      expect(res.body.error).toContain('disallowed address');
    });
  });
});
