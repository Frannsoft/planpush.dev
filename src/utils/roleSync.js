// Reconcile user roles from Okta groups and INITIAL_ADMIN_EMAILS
// Called on every login to sync SSO-derived roles; manual overrides persist

import { knex } from '../db.js';
import { invalidateUserPermCache } from './rbac.js';
import { writeAuditLog } from './audit.js';

// Parse comma-separated env list safely
function parseEmailList(envStr) {
  if (!envStr) return [];
  return envStr.split(',').map(e => e.trim()).filter(Boolean);
}

// Compute target role set from group mapping + initial admin list
async function computeTargetRoles(email, groups) {
  const initialAdmins = parseEmailList(process.env.INITIAL_ADMIN_EMAILS);

  // Initial admin takes precedence — only a verified (non-null) email may match
  if (email && initialAdmins.includes(email)) {
    return ['admin'];
  }

  if (!groups || groups.length === 0) {
    return [];
  }

  // Query group_role_map for all groups this user belongs to
  const mappedRoles = await knex('group_role_map')
    .whereIn('idp_group', groups)
    .select('role_id')
    .distinct();

  return mappedRoles.map(r => r.role_id);
}

// Reconcile user roles: sync SSO grants to match current groups
// Keeps manual grants; returns final role set
export async function reconcileRolesFromGroups(userId, email, groups) {
  const targetRoles = await computeTargetRoles(email, groups);

  // Get current SSO-origin roles
  const currentSsoRoles = await knex('user_roles')
    .where({ user_id: userId, origin: 'sso' })
    .select('role_id')
    .pluck('role_id');

  const targetSet = new Set(targetRoles);
  const currentSet = new Set(currentSsoRoles);

  // Roles to remove (in current but not target)
  const toRemove = [...currentSet].filter(r => !targetSet.has(r));

  // Roles to add (in target but not current)
  const toAdd = [...targetSet].filter(r => !currentSet.has(r));

  // Apply changes in transaction
  if (toRemove.length > 0 || toAdd.length > 0) {
    await knex.transaction(async (trx) => {
      // Remove roles
      if (toRemove.length > 0) {
        await trx('user_roles')
          .where({ user_id: userId, origin: 'sso' })
          .whereIn('role_id', toRemove)
          .delete();

        // Audit each removal
        for (const role of toRemove) {
          writeAuditLog(knex, {
            actorId: userId,
            action: 'user_role.removed',
            targetType: 'user',
            targetId: userId,
            meta: { role_id: role, origin: 'sso' },
          });
        }
      }

      // Add roles
      if (toAdd.length > 0) {
        for (const role of toAdd) {
          await trx('user_roles')
            .insert({ user_id: userId, role_id: role, origin: 'sso' })
            .onConflict()
            .ignore();

          writeAuditLog(knex, {
            actorId: userId,
            action: 'user_role.added',
            targetType: 'user',
            targetId: userId,
            meta: { role_id: role, origin: 'sso' },
          });
        }
      }
    });

    // Invalidate permission cache so new roles take effect immediately
    await invalidateUserPermCache(userId);
  }

  // Return final role set (SSO + manual)
  const finalRoles = await knex('user_roles')
    .where({ user_id: userId })
    .select('role_id')
    .pluck('role_id');

  return finalRoles;
}
