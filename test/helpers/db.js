import { knex } from '../../src/db.js';
import { createHmac, randomUUID } from 'crypto';
import { kv } from '../../src/kv.js';
import { hashToken, generateAccessToken, generateRefreshToken } from '../../src/utils/crypto.js';

// Table order for deletion (respecting foreign keys)
const TRUNCATE_TABLES = [
  'group_role_map',
  'scim_users',
  'scim_groups',
  'user_identities',
  'user_roles',
  'audit_log',
  'kv_store',
  'plan_comments',
  'session_versions',
  'sessions',
  'api_tokens',
  'device_codes', // Must come before dropping users_old (has FK to users)
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'sessions_store',
];

/**
 * Truncate all tables (reset database state)
 */
export async function resetDb() {
  // Clean up migration temp tables FIRST (before foreign key checks)
  try {
    await knex.raw('DROP TABLE IF EXISTS users_old');
  } catch (err) {
    // Ignore errors
  }

  try {
    await knex.raw('DROP TABLE IF EXISTS users_old_restore');
  } catch (err) {
    // Ignore errors
  }

  // Disable foreign key checks temporarily for SQLite
  if (knex.client.config.client === 'better-sqlite3') {
    await knex.raw('PRAGMA foreign_keys = OFF');
  }

  for (const table of TRUNCATE_TABLES) {
    try {
      await knex(table).del();
    } catch (err) {
      // Table may not exist, that's ok
    }
  }

  if (knex.client.config.client === 'better-sqlite3') {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

/**
 * Create a test user
 */
export async function seedUser({ role = 'developer', ...overrides } = {}) {
  const id = `user_${Math.random().toString(36).slice(2, 10)}`;
  const user = {
    id,
    github_user_id: `gh_${Math.floor(Math.random() * 1000000)}`,
    github_username: `test-user-${id}`,
    display_name: `Test User ${id}`,
    avatar_url: 'https://avatars.githubusercontent.com/u/0',
    role: 'member', // legacy column, not used in RBAC flow
    deactivated_at: null,
    ...overrides,
  };

  try {
    await knex('users').insert(user);
  } catch (err) {
    // If we get a "no such table: users_old" error, it means the migration left a temp table
    // Disable foreign keys globally and clean it up
    if (err && err.message && err.message.includes('users_old')) {
      await knex.raw('PRAGMA foreign_keys = OFF');
      try {
        await knex.raw('DROP TABLE IF EXISTS users_old');
        await knex.raw('DROP TABLE IF EXISTS users_old_restore');
      } catch (e) {
        // Ignore
      }
      // Retry the insert (foreign keys are now OFF)
      await knex('users').insert(user);
    } else {
      throw err;
    }
  }

  // Assign role via user_roles table
  const roleRecord = await knex('roles').where('id', role).first();
  if (roleRecord) {
    await knex('user_roles').insert({
      user_id: id,
      role_id: role,
      origin: 'manual',
    });
  }

  return user;
}

/**
 * Create a test session
 */
export async function seedSession({ created_by, published_at = new Date().toISOString(), ...overrides } = {}) {
  if (!created_by) {
    throw new Error('seedSession requires created_by user id');
  }

  const hexPart = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  const id = `sess_${hexPart}`;
  const session = {
    id,
    created_by,
    title: `Test Session ${id}`,
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    published_at,
    archived_at: null,
    deleted_at: null,
    current_version: 1,
    ...overrides,
  };

  try {
    await knex('sessions').insert(session);
  } catch (err) {
    // If we get a "no such table: users_old" error, it means the migration left a temp table
    if (err && err.message && err.message.includes('users_old')) {
      await knex.raw('PRAGMA foreign_keys = OFF');
      try {
        await knex.raw('DROP TABLE IF EXISTS users_old');
        await knex.raw('DROP TABLE IF EXISTS users_old_restore');
      } catch (e) {
        // Ignore
      }
      // Retry the insert (foreign keys are now OFF)
      await knex('sessions').insert(session);
    } else {
      throw err;
    }
  }

  return session;
}

/**
 * Create a test API token
 */
export async function seedToken({ user_id, ...overrides } = {}) {
  if (!user_id) {
    throw new Error('seedToken requires user_id');
  }

  const tokenId = `tok_${Math.random().toString(36).slice(2, 18)}`;
  const secret = `secret_${Math.random().toString(36).slice(2, 50)}`;

  // Hash the secret like the real code does
  const hash = createHmac('sha256', process.env.SECRET_KEY).update(secret).digest('hex');

  const token = {
    id: tokenId,
    user_id,
    hashed_token: hash,
    revoked_at: null,
    issued_at: new Date().toISOString(),
    ...overrides,
  };

  try {
    await knex('api_tokens').insert(token);
  } catch (err) {
    // Migration table-rebuilds can leave a dangling users_old reference; mirror the
    // workaround used by seedUser/seedRefreshToken.
    if (err && err.message && err.message.includes('users_old')) {
      await knex.raw('PRAGMA foreign_keys = OFF');
      try {
        await knex.raw('DROP TABLE IF EXISTS users_old');
        await knex.raw('DROP TABLE IF EXISTS users_old_restore');
      } catch (e) {
        // Ignore
      }
      await knex('api_tokens').insert(token);
    } else {
      throw err;
    }
  }
  return { ...token, secret };
}

/**
 * Seed a refresh/access token pair for testing device flow + token rotation
 * Returns both tokens and the family_id for tracking family revocation
 */
export async function seedRefreshToken({ user_id, ...overrides } = {}) {
  if (!user_id) {
    throw new Error('seedRefreshToken requires user_id');
  }

  const refreshToken = generateRefreshToken();
  const hashedToken = await hashToken(refreshToken);
  const tokenId = randomUUID();

  const token = {
    id: tokenId,
    user_id,
    hashed_token: hashedToken,
    family_id: tokenId, // Initial token's family is itself
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };

  try {
    await knex('api_tokens').insert(token);
  } catch (err) {
    // If we get a "no such table: users_old" error, it means the migration left a temp table
    // Disable foreign keys globally and clean it up
    if (err && err.message && err.message.includes('users_old')) {
      await knex.raw('PRAGMA foreign_keys = OFF');
      try {
        await knex.raw('DROP TABLE IF EXISTS users_old');
        await knex.raw('DROP TABLE IF EXISTS users_old_restore');
      } catch (e) {
        // Ignore
      }
      // Retry the insert (foreign keys are now OFF)
      await knex('api_tokens').insert(token);
    } else {
      throw err;
    }
  }

  return { refreshToken, tokenId, familyId: tokenId };
}

/**
 * Seed an access token into KV store (as it would be returned by /api/auth/token)
 * Returns the access token string for use in Bearer auth
 */
export async function seedAccessToken({ user_id, token_id, display_name = 'Test User', role = 'member' }) {
  if (!user_id || !token_id) {
    throw new Error('seedAccessToken requires user_id and token_id');
  }

  const accessToken = generateAccessToken();

  await kv.put(
    `access_token:${accessToken}`,
    JSON.stringify({
      user_id,
      display_name,
      role,
      token_id,
    }),
    { expirationTtl: 60 * 60 } // 1 hour
  );

  return accessToken;
}
