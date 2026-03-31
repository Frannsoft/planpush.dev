import { knex } from '../db.js';
import { writeAuditLog } from '../utils/audit.js';

// GET /api/tokens — list the requesting user's active tokens
export async function handleListTokens(req, res) {
  const tokens = await knex('api_tokens')
    .where({ user_id: req.tokenData.user_id })
    .whereNull('revoked_at')
    .select('id', 'label', 'issued_at', 'last_used_at')
    .orderBy('issued_at', 'desc');

  res.json({ tokens });
}

// DELETE /api/tokens/:id — revoke a token (own tokens, or any token for admins)
export async function handleRevokeToken(req, res) {
  const tokenId = req.params.id;

  const token = await knex('api_tokens')
    .where({ id: tokenId })
    .whereNull('revoked_at')
    .select('id', 'user_id')
    .first();

  if (!token) {
    return res.status(404).json({ error: 'token_not_found' });
  }

  // Non-admins can only revoke their own tokens
  if (token.user_id !== req.tokenData.user_id && req.tokenData.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  await knex('api_tokens').where({ id: tokenId }).update({ revoked_at: knex.fn.now() });

  writeAuditLog(knex, {
    actorId: req.tokenData.user_id,
    action: 'token.revoked',
    targetType: 'token',
    targetId: tokenId,
    meta: { revoked_user_id: token.user_id },
  });

  res.json({ ok: true, id: tokenId });
}
