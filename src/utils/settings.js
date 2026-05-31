// Settings configuration reader
// ENV WINS: if an environment variable is set, it is locked (read-only in UI)
// and the DB value is ignored. This allows gradual migration from .env to DB.

import { knex } from '../db.js';
import { decryptSecret } from './secrets.js';

// Settings metadata: which are secrets, which env vars they correspond to
const SETTINGS_METADATA = {
  AUTH_PROVIDER: { isSecret: false, envVar: 'AUTH_PROVIDER' },
  OKTA_ISSUER: { isSecret: false, envVar: 'OKTA_ISSUER' },
  OKTA_CLIENT_ID: { isSecret: false, envVar: 'OKTA_CLIENT_ID' },
  OKTA_CLIENT_SECRET: { isSecret: true, envVar: 'OKTA_CLIENT_SECRET' },
  GITHUB_CLIENT_ID: { isSecret: false, envVar: 'GITHUB_CLIENT_ID' },
  GITHUB_CLIENT_SECRET: { isSecret: true, envVar: 'GITHUB_CLIENT_SECRET' },
  GITHUB_ORG: { isSecret: false, envVar: 'GITHUB_ORG' },
  POST_LOGOUT_REDIRECT_URI: { isSecret: false, envVar: 'POST_LOGOUT_REDIRECT_URI' },
  SESSION_IDLE_TIMEOUT: { isSecret: false, envVar: 'SESSION_IDLE_TIMEOUT' },
  SESSION_MAX_AGE: { isSecret: false, envVar: 'SESSION_MAX_AGE' },
  INITIAL_ADMIN_EMAILS: { isSecret: false, envVar: 'INITIAL_ADMIN_EMAILS' },
  SLACK_WEBHOOK_URL: { isSecret: false, envVar: 'SLACK_WEBHOOK_URL' },
  SCIM_AUTH_TOKEN: { isSecret: true, envVar: 'SCIM_AUTH_TOKEN' },
  BASE_URL: { isSecret: false, envVar: 'BASE_URL' },
};

/**
 * Get a setting value, with ENV taking precedence
 * Returns: { value, isLocked, isSet }
 * - value: the actual value (decrypted if secret), or null if not set
 * - isLocked: true if env var is set (read-only in UI)
 * - isSet: true if either env or DB has a value
 */
export async function getSetting(key) {
  const meta = SETTINGS_METADATA[key];
  if (!meta) {
    throw new Error(`Unknown setting: ${key}`);
  }

  // Check environment first (ENV WINS)
  const envValue = process.env[meta.envVar];
  if (envValue !== undefined) {
    return {
      value: envValue,
      isLocked: true,
      isSet: true,
    };
  }

  // Check database
  const row = await knex('settings').where({ key }).first();
  if (!row || row.value === null) {
    return {
      value: null,
      isLocked: false,
      isSet: false,
    };
  }

  let decryptedValue = row.value;
  let isSet = true;

  if (meta.isSecret) {
    try {
      decryptedValue = decryptSecret(row.value, process.env.SECRET_KEY);
    } catch (err) {
      console.error(`[settings] Failed to decrypt ${key}:`, err.message);
      return {
        value: null,
        isLocked: false,
        isSet: false,
      };
    }
  }

  return {
    value: meta.isSecret ? null : decryptedValue, // Don't return actual secret values to API
    isLocked: false,
    isSet,
  };
}

/**
 * Get all settings with their current state
 * Returns array of { key, value (secrets as null), isLocked, isSet, isSecret }
 */
export async function getAllSettings() {
  const keys = Object.keys(SETTINGS_METADATA);
  const results = [];

  for (const key of keys) {
    const meta = SETTINGS_METADATA[key];
    const setting = await getSetting(key);

    results.push({
      key,
      value: setting.value,
      isLocked: setting.isLocked,
      isSet: setting.isSet,
      isSecret: meta.isSecret,
    });
  }

  return results;
}

/**
 * Get actual setting value for runtime use (decrypted if secret, respects ENV override)
 * Returns the value or null
 */
export async function getSettingValue(key) {
  const meta = SETTINGS_METADATA[key];
  if (!meta) {
    throw new Error(`Unknown setting: ${key}`);
  }

  // Check environment first (ENV WINS)
  const envValue = process.env[meta.envVar];
  if (envValue !== undefined) {
    return envValue;
  }

  // Check database
  const row = await knex('settings').where({ key }).first();
  if (!row || !row.value) {
    return null;
  }

  if (meta.isSecret) {
    try {
      return decryptSecret(row.value, process.env.SECRET_KEY);
    } catch (err) {
      console.error(`[settings] Failed to decrypt ${key}:`, err.message);
      return null;
    }
  }

  return row.value;
}

/**
 * Check if a setting is defined (env or DB)
 */
export async function isSettingSet(key) {
  const setting = await getSetting(key);
  return setting.isSet;
}

/**
 * Validate that a setting is not locked (i.e., not overridden by env var)
 */
export function validateSettingNotLocked(key) {
  const meta = SETTINGS_METADATA[key];
  if (!meta) {
    throw new Error(`Unknown setting: ${key}`);
  }

  if (process.env[meta.envVar] !== undefined) {
    throw new Error(`Setting ${key} is locked by environment variable`);
  }
}

/**
 * List all known settings
 */
export function listKnownSettings() {
  return Object.keys(SETTINGS_METADATA);
}

/**
 * Check if a setting is secret
 */
export function isSecretSetting(key) {
  const meta = SETTINGS_METADATA[key];
  if (!meta) return false;
  return meta.isSecret;
}

/**
 * Load DB-backed settings into process.env at startup.
 *
 * The whole runtime reads config from process.env (auth provider routing,
 * provider clients, session middleware, etc.), so DB-stored settings only take
 * effect once copied into the environment. This must run BEFORE app.js is
 * evaluated, because app.js reads several of these at module-load time.
 *
 * ENV WINS: an existing process.env value is never overwritten, so explicit
 * env/deploy configuration always takes precedence over DB-stored settings
 * (mirrors getSetting()/getSettingValue()).
 *
 * Tolerates a missing settings table (fresh DB before migrations) by no-op.
 */
export async function hydrateSettingsIntoEnv() {
  let rows;
  try {
    rows = await knex('settings').select('key', 'value');
  } catch (err) {
    // settings table not present yet — nothing to hydrate
    console.error('[settings] hydrate skipped:', err.message);
    return;
  }

  let applied = 0;
  for (const row of rows) {
    const meta = SETTINGS_METADATA[row.key];
    if (!meta) continue;                                   // unknown/legacy key
    if (process.env[meta.envVar] !== undefined) continue;  // ENV WINS
    if (row.value === null || row.value === '') continue;  // unset

    let value = row.value;
    if (meta.isSecret) {
      try {
        value = decryptSecret(row.value, process.env.SECRET_KEY);
      } catch (err) {
        console.error(`[settings] hydrate: failed to decrypt ${row.key}:`, err.message);
        continue;
      }
    }

    process.env[meta.envVar] = value;
    applied++;
  }

  if (applied > 0) console.log(`[settings] hydrated ${applied} setting(s) from database`);
}
