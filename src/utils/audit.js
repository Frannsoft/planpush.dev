// Fire-and-forget audit log writer — never blocks the caller

export function writeAuditLog(knex, { actorId, action, targetType, targetId, meta }) {
  setImmediate(() => {
    knex('audit_log')
      .insert({
        actor_id: actorId || null,
        action,
        target_type: targetType || null,
        target_id: targetId || null,
        meta: meta ? JSON.stringify(meta) : null,
      })
      .catch((err) => console.error('[audit]', err.message));
  });
}
