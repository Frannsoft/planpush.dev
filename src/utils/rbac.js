// RBAC engine: resolve user permissions and enforce checks

import { knex } from '../db.js';
import { kv } from '../kv.js';

const PERM_CACHE_TTL = 60; // seconds
const PERM_CACHE_KEY_PREFIX = 'perms:';

// Define permission scope: which permissions are ownership-scoped
// Ownership-scoped: user must own the resource OR be admin/PM
// Instance-wide: user with permission can act on any resource
const OWN_SCOPED_PERMS = ['session_publish', 'session_archive'];

// Resolve the effective permission set for a user from DB, cached for ~60s
export async function getUserPermissions(userId) {
  const cacheKey = `${PERM_CACHE_KEY_PREFIX}${userId}`;
  const cached = await kv.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Invalid cache, proceed to DB
    }
  }

  // Query user's roles and their permissions
  const userRoles = await knex('user_roles')
    .where('user_id', userId)
    .join('roles', 'user_roles.role_id', 'roles.id')
    .select('roles.id as role_id')
    .then(rows => rows.map(r => r.role_id));

  // If no roles, user has no permissions (shouldn't happen for active users)
  if (userRoles.length === 0) {
    const perms = [];
    await kv.put(cacheKey, JSON.stringify(perms), { expirationTtl: PERM_CACHE_TTL });
    return perms;
  }

  // Query all permissions for this user's roles
  const permRows = await knex('role_permissions')
    .whereIn('role_id', userRoles)
    .select('permission_id')
    .distinct();

  const perms = permRows.map(r => r.permission_id);

  // Cache the result
  await kv.put(cacheKey, JSON.stringify(perms), { expirationTtl: PERM_CACHE_TTL });

  return perms;
}

// Invalidate permission cache when roles change
export async function invalidateUserPermCache(userId) {
  const cacheKey = `${PERM_CACHE_KEY_PREFIX}${userId}`;
  await kv.delete(cacheKey);
}

// Check if user has a permission, with optional resource ownership check
// For ownership-scoped permissions: user must own the resource OR be admin/PM
// For instance-wide permissions: having the permission is sufficient
export async function can(user, permission, resource) {
  const perms = await getUserPermissions(user.id);

  // Check baseline permission
  if (!perms.includes(permission)) {
    return false;
  }

  // If resource provided and permission is ownership-scoped, check ownership
  if (resource && OWN_SCOPED_PERMS.includes(permission)) {
    // Admin and PM roles bypass ownership check
    const userRoles = await knex('user_roles')
      .where('user_id', user.id)
      .select('role_id')
      .then(rows => rows.map(r => r.role_id));

    const isAdminOrPm = userRoles.some(r => ['admin', 'project_manager'].includes(r));
    if (!isAdminOrPm && resource.created_by !== user.id) {
      return false;
    }
  }

  return true;
}

// Express middleware: check permission, return 403 if denied
export function requirePermission(permission) {
  return async (req, res, next) => {
    const tokenData = req.tokenData;
    if (!tokenData) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Always re-fetch user perms from DB (short cache will avoid most round-trips)
    const user = await knex('users').where({ id: tokenData.user_id }).select('id', 'deactivated_at').first();
    if (!user || user.deactivated_at) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const hasPermission = await can({ id: tokenData.user_id }, permission);
    if (!hasPermission) {
      return res.status(403).json({ error: 'forbidden' });
    }

    next();
  };
}
