import { knex } from '../db.js';
import { writeAuditLog } from '../utils/audit.js';
import { canAccessSession } from '../utils/visibility.js';
import { can, getUserPermissions } from '../utils/rbac.js';
import { recordSessionViews } from '../dashboard/queries.js';
import { isValidSessionId } from '../utils/validate.js';

// PATCH /api/sessions/:id/archive — toggle archive (owner or pm/admin with session_archive permission)
export async function handleArchiveSession(req, res) {
  const sessionId = req.params.id;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }
  const userId = req.tokenData.user_id;
  const { archived } = req.body;

  if (typeof archived !== 'boolean') {
    return res.status(400).json({ error: 'invalid_body', expected: { archived: 'boolean' } });
  }

  const session = await knex('sessions')
    .where({ id: sessionId })
    .whereNull('deleted_at')
    .select('id', 'title', 'created_by', 'archived_at')
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  // Check session_archive permission (enforced with ownership for developers)
  const user = { id: userId };
  const hasPermission = await can(user, 'session_archive', session);
  if (!hasPermission) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const archivedAt = archived ? knex.fn.now() : null;
  await knex('sessions').where({ id: sessionId }).update({ archived_at: archivedAt });

  writeAuditLog(knex, {
    actorId: userId,
    action: archived ? 'session.archived' : 'session.unarchived',
    targetType: 'session',
    targetId: sessionId,
    meta: { title: session.title },
  });

  res.json({ ok: true, id: sessionId, archived });
}

// POST /api/sessions/:id/publish — one-way publish (owner or pm/admin with session_publish permission)
export async function handlePublishSession(req, res) {
  const sessionId = req.params.id;
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }
  const userId = req.tokenData.user_id;

  const session = await knex('sessions')
    .where({ id: sessionId })
    .whereNull('deleted_at')
    .select('id', 'title', 'created_by', 'published_at')
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const userPerms = await getUserPermissions(userId);
  if (!canAccessSession(session, req.tokenData, userPerms)) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  // Check session_publish permission (enforced with ownership for developers)
  const user = { id: userId };
  const hasPermission = await can(user, 'session_publish', session);
  if (!hasPermission) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (session.published_at) {
    return res.json({ ok: true, id: sessionId });
  }

  await knex('sessions').where({ id: sessionId }).update({ published_at: knex.fn.now() });

  writeAuditLog(knex, {
    actorId: userId,
    action: 'session.published',
    targetType: 'session',
    targetId: sessionId,
    meta: { title: session.title },
  });

  res.json({ ok: true, id: sessionId });
}

// POST /api/dashboard/views — record session views for "new since last visit"
export async function handleRecordViews(req, res) {
  const { session_ids } = req.body;

  if (!Array.isArray(session_ids) || session_ids.length === 0) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const validIds = session_ids.filter(isValidSessionId);
  if (validIds.length === 0) {
    return res.status(400).json({ error: 'invalid_session_ids' });
  }

  try {
    await recordSessionViews(req.tokenData.user_id, validIds);
  } catch {
    // Non-fatal — stale session IDs may cause FK violations
  }
  res.json({ ok: true });
}
