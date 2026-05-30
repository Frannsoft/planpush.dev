import { knex } from '../../src/db.js';
import { createHmac } from 'crypto';

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
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'device_codes',
  'sessions_store',
];

/**
 * Truncate all tables (reset database state)
 */
export async function resetDb() {
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
    github_id: Math.floor(Math.random() * 1000000),
    github_login: `test-user-${id}`,
    display_name: `Test User ${id}`,
    email: `test-${id}@example.com`,
    avatar_url: 'https://avatars.githubusercontent.com/u/0',
    role: 'member', // legacy column, not used in RBAC flow
    deactivated_at: null,
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };

  await knex('users').insert(user);

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

  const id = `sess_${Math.random().toString(36).slice(2, 14)}`;
  const session = {
    id,
    created_by,
    title: `Test Session ${id}`,
    html_content: '<h1>Test</h1>',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    published_at,
    archived_at: null,
    deleted_at: null,
    ...overrides,
  };

  await knex('sessions').insert(session);
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
    secret_hash: hash,
    description: 'Test token',
    revoked_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };

  await knex('api_tokens').insert(token);
  return { ...token, secret };
}
