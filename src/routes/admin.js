import { knex } from '../db.js';
import { kv } from '../kv.js';
import { writeAuditLog } from '../utils/audit.js';
import { isValidSessionId } from '../utils/validate.js';

// DELETE /api/sessions/:id — soft-delete a session (admin only)
export async function handleDeleteSession(req, res) {
  const sessionId = req.params.id;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }

  const session = await knex('sessions')
    .where({ id: sessionId })
    .whereNull('deleted_at')
    .select('id', 'title')
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  await knex('sessions').where({ id: sessionId }).update({ deleted_at: knex.fn.now() });

  writeAuditLog(knex, {
    actorId: req.tokenData.user_id,
    action: 'session.deleted',
    targetType: 'session',
    targetId: sessionId,
    meta: { title: session.title },
  });

  res.json({ ok: true, id: sessionId });
}

// PATCH /api/users/:id/role — change a user's role (admin only)
export async function handlePatchUserRole(req, res) {
  const targetId = req.params.id;
  const { role } = req.body;

  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }

  if (targetId === req.tokenData.user_id) {
    return res.status(409).json({ error: 'cannot_change_own_role' });
  }

  const user = await knex('users').where({ id: targetId }).select('id', 'role', 'github_username').first();
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  if (user.role === role) {
    return res.json({ id: targetId, role });
  }

  // Prevent demoting the last admin
  if (user.role === 'admin' && role === 'member') {
    const adminCount = await knex('users').where({ role: 'admin' }).whereNull('deactivated_at').count('* as c').first();
    if (parseInt(adminCount.c, 10) <= 1) {
      return res.status(409).json({ error: 'cannot_demote_last_admin' });
    }
  }

  await knex('users').where({ id: targetId }).update({ role });

  writeAuditLog(knex, {
    actorId: req.tokenData.user_id,
    action: 'user.role_changed',
    targetType: 'user',
    targetId,
    meta: { old_role: user.role, new_role: role, github_username: user.github_username },
  });

  res.json({ id: targetId, role });
}

// PATCH /api/users/:id/deactivate — activate or deactivate a user (admin only)
export async function handleDeactivateUser(req, res) {
  const targetId = req.params.id;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'invalid_body', expected: { active: 'boolean' } });
  }

  if (targetId === req.tokenData.user_id) {
    return res.status(409).json({ error: 'cannot_deactivate_self' });
  }

  const user = await knex('users').where({ id: targetId }).select('id', 'role', 'github_username', 'deactivated_at').first();
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  // Prevent deactivating the last admin
  if (!active && user.role === 'admin') {
    const adminCount = await knex('users').where({ role: 'admin' }).whereNull('deactivated_at').count('* as c').first();
    if (parseInt(adminCount.c, 10) <= 1) {
      return res.status(409).json({ error: 'cannot_deactivate_last_admin' });
    }
  }

  const deactivatedAt = active ? null : knex.fn.now();
  await knex('users').where({ id: targetId }).update({ deactivated_at: deactivatedAt });

  // Clear deactivation cache so the change takes effect immediately
  await kv.delete(`deactivated:${targetId}`);

  writeAuditLog(knex, {
    actorId: req.tokenData.user_id,
    action: active ? 'user.reactivated' : 'user.deactivated',
    targetType: 'user',
    targetId,
    meta: { active, github_username: user.github_username },
  });

  const updated = await knex('users').where({ id: targetId }).select('deactivated_at').first();
  res.json({ id: targetId, deactivated_at: updated.deactivated_at });
}

// GET /api/admin/activity — server-wide audit log (admin only)
export async function handleGetAdminActivity(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = Math.max(0, Math.min(parseInt(req.query.offset, 10) || 0, 100000));
  const actionFilter = req.query.action;

  let query = knex('audit_log as a')
    .leftJoin('users as u', 'a.actor_id', 'u.id')
    .select(
      'a.id', 'a.action', 'a.target_type', 'a.target_id', 'a.meta', 'a.created_at',
      'u.id as actor_user_id', 'u.github_username as actor_github_username',
      'u.display_name as actor_display_name',
    )
    .orderBy('a.created_at', 'desc');

  let countQuery = knex('audit_log as a');

  if (actionFilter) {
    query = query.where('a.action', actionFilter);
    countQuery = countQuery.where('a.action', actionFilter);
  }

  const [rows, countRow] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count('* as total').first(),
  ]);

  const activity = rows.map((r) => ({
    id: r.id,
    actor: r.actor_user_id ? {
      id: r.actor_user_id,
      github_username: r.actor_github_username,
      display_name: r.actor_display_name,
    } : null,
    action: r.action,
    target_type: r.target_type,
    target_id: r.target_id,
    meta: r.meta ? (() => { try { return JSON.parse(r.meta); } catch { return r.meta; } })() : null,
    created_at: r.created_at,
  }));

  res.json({ activity, total: parseInt(countRow.total, 10) });
}
