import { knex } from '../db.js';
import { kv } from '../kv.js';
import { writeAuditLog } from '../utils/audit.js';

// Handler for SCIM /Users resource
export const scimUsersHandler = {
  // GET /scim/v2/Users/:id — retrieve a specific user
  async ingress(resource) {
    if (resource.id) {
      // Single user retrieval
      const user = await knex('users')
        .where({ id: resource.id })
        .select('id', 'email', 'display_name', 'deactivated_at')
        .first();

      if (!user) {
        resource.id = undefined; // Signal 404
        return;
      }

      // Map database user to SCIM user schema
      resource.userName = user.email || user.id;
      resource.emails = user.email ? [{ value: user.email, primary: true }] : [];
      resource.displayName = user.display_name || '';
      resource.active = !user.deactivated_at;
    }
  },

  // GET /scim/v2/Users?filter=... or /scim/v2/Users — list users with optional filtering
  async egress(resource) {
    // Retrieve all non-deactivated users (or apply filter if provided)
    const query = knex('users').select('id', 'email', 'display_name', 'deactivated_at');

    // Parse filter if provided in resource context (scimmy-routers handles this)
    if (resource.filter) {
      // For now, simple equals on userName (email)
      if (resource.filter.attributePath === 'userName' && resource.filter.compareValue) {
        query.where('email', resource.filter.compareValue);
      }
    }

    const users = await query.orderBy('id');

    // Transform each user to SCIM format
    return users.map(user => ({
      id: user.id,
      userName: user.email || user.id,
      emails: user.email ? [{ value: user.email, primary: true }] : [],
      displayName: user.display_name || '',
      active: !user.deactivated_at,
    }));
  },

  // POST /scim/v2/Users — create a new user from SCIM provisioning
  async write(resource, data) {
    const userId = resource.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const email = data.userName || data.emails?.[0]?.value || '';
    const displayName = data.displayName || data.userName || '';
    const active = data.active !== false; // Default to active

    // Create user in database
    await knex('users').insert({
      id: userId,
      email,
      display_name: displayName,
      github_username: email.split('@')[0], // Fallback username from email
      deactivated_at: active ? null : knex.fn.now(),
      joined_at: knex.fn.now(),
    });

    // Create user_identity for Okta if idp is provided
    if (data.externalId || data.id) {
      const identityId = `${userId}-okta`;
      const subject = data.externalId || data.id;
      await knex('user_identities').insert({
        id: identityId,
        user_id: userId,
        idp: 'okta',
        subject,
        created_at: knex.fn.now(),
      });
    }

    writeAuditLog(knex, {
      actorId: null, // SCIM provisioning is automated
      action: 'user.provisioned',
      targetType: 'user',
      targetId: userId,
      meta: { email, via: 'scim' },
    });

    resource.id = userId;
    return resource;
  },

  // PATCH /scim/v2/Users/:id — apply PATCH operations (e.g., deactivate)
  async modify(resource, ops) {
    const userId = resource.id;

    const user = await knex('users')
      .where({ id: userId })
      .select('id', 'deactivated_at')
      .first();

    if (!user) {
      resource.id = undefined;
      return resource;
    }

    // Process each PATCH operation
    for (const op of ops) {
      if (op.op === 'replace' && op.path === 'active') {
        const active = op.value === true;

        if (active && user.deactivated_at) {
          // Reactivate: clear deactivated_at
          await knex('users').where({ id: userId }).update({ deactivated_at: null });
          await kv.delete(`deactivated:${userId}`);

          writeAuditLog(knex, {
            actorId: null,
            action: 'user.reactivated',
            targetType: 'user',
            targetId: userId,
            meta: { via: 'scim' },
          });
        } else if (!active && !user.deactivated_at) {
          // Deactivate: set deactivated_at and revoke tokens
          await knex('users').where({ id: userId }).update({ deactivated_at: knex.fn.now() });
          await kv.delete(`deactivated:${userId}`);

          // Revoke all api_tokens in the same family
          const tokens = await knex('api_tokens')
            .where({ user_id: userId })
            .whereNull('revoked_at')
            .select('id', 'family_id')
            .limit(1);

          if (tokens.length > 0) {
            const familyId = tokens[0].family_id || tokens[0].id;
            await knex('api_tokens')
              .where({ family_id: familyId })
              .whereNull('revoked_at')
              .update({ revoked_at: knex.fn.now() });
          }

          writeAuditLog(knex, {
            actorId: null,
            action: 'user.deactivated',
            targetType: 'user',
            targetId: userId,
            meta: { via: 'scim' },
          });
        }
      }
    }

    // Reload and return updated user
    const updated = await knex('users')
      .where({ id: userId })
      .select('id', 'email', 'display_name', 'deactivated_at')
      .first();

    return {
      id: updated.id,
      userName: updated.email || updated.id,
      emails: updated.email ? [{ value: updated.email, primary: true }] : [],
      displayName: updated.display_name || '',
      active: !updated.deactivated_at,
    };
  },

  // PUT /scim/v2/Users/:id — replace entire user resource
  async replace(resource, data) {
    const userId = resource.id;

    const user = await knex('users')
      .where({ id: userId })
      .select('id', 'deactivated_at')
      .first();

    if (!user) {
      resource.id = undefined;
      return resource;
    }

    const email = data.userName || data.emails?.[0]?.value || '';
    const displayName = data.displayName || data.userName || '';
    const active = data.active !== false;

    // Update user in database
    await knex('users').where({ id: userId }).update({
      email,
      display_name: displayName,
      deactivated_at: active ? null : knex.fn.now(),
    });

    // Handle reactivation/deactivation side effects
    if (active && user.deactivated_at) {
      await kv.delete(`deactivated:${userId}`);
      writeAuditLog(knex, {
        actorId: null,
        action: 'user.reactivated',
        targetType: 'user',
        targetId: userId,
        meta: { via: 'scim' },
      });
    } else if (!active && !user.deactivated_at) {
      await kv.delete(`deactivated:${userId}`);

      // Revoke all api_tokens in the same family
      const tokens = await knex('api_tokens')
        .where({ user_id: userId })
        .whereNull('revoked_at')
        .select('id', 'family_id')
        .limit(1);

      if (tokens.length > 0) {
        const familyId = tokens[0].family_id || tokens[0].id;
        await knex('api_tokens')
          .where({ family_id: familyId })
          .whereNull('revoked_at')
          .update({ revoked_at: knex.fn.now() });
      }

      writeAuditLog(knex, {
        actorId: null,
        action: 'user.deactivated',
        targetType: 'user',
        targetId: userId,
        meta: { via: 'scim' },
      });
    }

    return {
      id: userId,
      userName: email || userId,
      emails: email ? [{ value: email, primary: true }] : [],
      displayName,
      active: !user.deactivated_at,
    };
  },

  // DELETE /scim/v2/Users/:id — soft-delete a user (not implemented, but required by spec)
  async delete(resource) {
    // For now, just deactivate the user instead of hard-deleting
    const userId = resource.id;
    await knex('users').where({ id: userId }).update({ deactivated_at: knex.fn.now() });
    await kv.delete(`deactivated:${userId}`);

    writeAuditLog(knex, {
      actorId: null,
      action: 'user.deactivated',
      targetType: 'user',
      targetId: userId,
      meta: { via: 'scim_delete' },
    });
  },
};
