import { knex } from '../db.js';
import { writeAuditLog } from '../utils/audit.js';
import { recordSessionViews } from '../dashboard/queries.js';

// PATCH /api/sessions/:id/archive — toggle archive (owner or admin)
export async function handleArchiveSession(req, res) {
  const sessionId = req.params.id;
  const userId = req.tokenData.user_id;
  const { archived } = req.body;

  // Live DB role check (cookie role can be stale after demotion)
  const user = await knex('users').where({ id: userId }).select('role').first();
  const isAdmin = user?.role === 'admin';

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

  if (!isAdmin && session.created_by !== userId) {
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

// POST /api/dashboard/views — record session views for "new since last visit"
export async function handleRecordViews(req, res) {
  const { session_ids } = req.body;

  if (!Array.isArray(session_ids) || session_ids.length === 0) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  try {
    await recordSessionViews(req.tokenData.user_id, session_ids);
  } catch {
    // Non-fatal — stale session IDs may cause FK violations
  }
  res.json({ ok: true });
}
