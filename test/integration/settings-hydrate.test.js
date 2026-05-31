import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { knex } from '../../src/db.js';
import { hydrateSettingsIntoEnv } from '../../src/utils/settings.js';
import { encryptSecret } from '../../src/utils/secrets.js';

// Keys this suite touches, so we can clean them up between tests.
const KEYS = ['AUTH_PROVIDER', 'OKTA_CLIENT_SECRET', 'SESSION_IDLE_TIMEOUT', 'GITHUB_ORG'];
const ENV_VARS = ['AUTH_PROVIDER', 'OKTA_CLIENT_SECRET', 'SESSION_IDLE_TIMEOUT', 'GITHUB_ORG'];

describe('hydrateSettingsIntoEnv', () => {
  const saved = {};

  beforeEach(async () => {
    // Snapshot + clear the env vars under test
    for (const v of ENV_VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
    await knex('settings').whereIn('key', KEYS).delete();
  });

  afterEach(async () => {
    for (const v of ENV_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    await knex('settings').whereIn('key', KEYS).delete();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  it('copies a plain DB setting into process.env', async () => {
    await knex('settings').insert({ key: 'AUTH_PROVIDER', value: 'okta', is_secret: 0 });

    await hydrateSettingsIntoEnv();

    expect(process.env.AUTH_PROVIDER).toBe('okta');
  });

  it('decrypts a secret DB setting into process.env', async () => {
    const ct = encryptSecret('super-secret-value', process.env.SECRET_KEY);
    await knex('settings').insert({ key: 'OKTA_CLIENT_SECRET', value: ct, is_secret: 1 });

    await hydrateSettingsIntoEnv();

    expect(process.env.OKTA_CLIENT_SECRET).toBe('super-secret-value');
  });

  it('does NOT overwrite an existing env var (ENV WINS)', async () => {
    process.env.AUTH_PROVIDER = 'github';
    await knex('settings').insert({ key: 'AUTH_PROVIDER', value: 'okta', is_secret: 0 });

    await hydrateSettingsIntoEnv();

    expect(process.env.AUTH_PROVIDER).toBe('github');
  });

  it('skips null/empty DB values', async () => {
    await knex('settings').insert({ key: 'GITHUB_ORG', value: null, is_secret: 0 });

    await hydrateSettingsIntoEnv();

    expect(process.env.GITHUB_ORG).toBeUndefined();
  });

  it('hydrates the newly-added editable keys (e.g. session timeouts)', async () => {
    await knex('settings').insert({ key: 'SESSION_IDLE_TIMEOUT', value: '3600', is_secret: 0 });

    await hydrateSettingsIntoEnv();

    expect(process.env.SESSION_IDLE_TIMEOUT).toBe('3600');
  });

  it('skips a secret it cannot decrypt instead of throwing', async () => {
    await knex('settings').insert({ key: 'OKTA_CLIENT_SECRET', value: 'not-valid-ciphertext', is_secret: 1 });

    await expect(hydrateSettingsIntoEnv()).resolves.toBeUndefined();
    expect(process.env.OKTA_CLIENT_SECRET).toBeUndefined();
  });
});
