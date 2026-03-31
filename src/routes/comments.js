import { randomUUID } from 'crypto';
import { knex } from '../db.js';
import { notifySlack } from '../utils/slack.js';

// GET /api/comments?session_id={sessionId}
export async function handleGetComments(req, res) {
  const tokenData = req.tokenData;
  const sessionId = req.query.session_id;

  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' });
  }

  const session = await knex('sessions')
    .where({ id: sessionId })
    .whereNull('deleted_at')
    .select('id', 'current_version')
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const results = await knex('comments as c')
    .join('users as u', 'c.author_id', 'u.id')
    .where('c.session_id', sessionId)
    .select(
      'c.id', 'c.content', 'c.anchor', 'c.resolved', 'c.created_at',
      'c.author_id', 'c.plan_version',
      'u.github_user_id as author_github_id',
      'u.display_name as author_display_name',
    )
    .orderBy('c.created_at', 'asc');

  res.json({ comments: results || [], current_version: session.current_version });
}

// POST /api/comments
export async function handlePostComment(req, res) {
  const tokenData = req.tokenData;
  const { session_id, content, anchor } = req.body;

  if (!session_id || !content) {
    return res.status(400).json({ error: 'missing_fields', required: ['session_id', 'content'] });
  }
  if (content.length > 4000) {
    return res.status(400).json({ error: 'comment_too_long', max: 4000 });
  }
  if (anchor && anchor.length > 200) {
    return res.status(400).json({ error: 'anchor_too_long', max: 200 });
  }

  const session = await knex('sessions')
    .where({ id: session_id })
    .whereNull('deleted_at')
    .select('id', 'title', 'current_version')
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const commentId = randomUUID();

  await knex('comments').insert({
    id: commentId,
    session_id,
    author_id: tokenData.user_id,
    content,
    anchor: anchor || null,
    plan_version: session.current_version,
  });

  // Fire-and-forget Slack notification
  const planUrl = `${req.planpushBaseUrl}/p/${session_id}`;
  setImmediate(() => {
    notifySlack({
      event: 'comment_added',
      sessionId: session_id,
      sessionTitle: session.title || 'Untitled Plan',
      author: tokenData.display_name || tokenData.github_username,
      content,
      anchor: anchor || null,
      planUrl,
    }).catch(console.error);
  });

  res.status(201).json({
    id: commentId,
    session_id,
    content,
    anchor: anchor || null,
    plan_version: session.current_version,
    resolved: 0,
    created_at: new Date().toISOString(),
    author_display_name: tokenData.display_name || null,
  });
}

// PATCH /api/comments/:id/resolve
export async function handleResolveComment(req, res) {
  const tokenData = req.tokenData;
  const commentId = req.params.id;

  if (!commentId) {
    return res.status(400).json({ error: 'missing_comment_id' });
  }

  const comment = await knex('comments as c')
    .join('sessions as s', 'c.session_id', 's.id')
    .where('c.id', commentId)
    .whereNull('s.deleted_at')
    .select('c.id', 'c.session_id', 'c.anchor', 'c.author_id', 's.title')
    .first();

  if (!comment) {
    return res.status(404).json({ error: 'comment_not_found' });
  }

  // Only the comment author can resolve
  if (comment.author_id !== tokenData.user_id) {
    return res.status(403).json({ error: 'only_author_can_resolve' });
  }

  await knex('comments').where({ id: commentId }).update({ resolved: 1, resolved_at: knex.fn.now() });

  // Fire-and-forget Slack notification
  const planUrl = `${req.planpushBaseUrl}/p/${comment.session_id}`;
  setImmediate(() => {
    notifySlack({
      event: 'comment_resolved',
      sessionId: comment.session_id,
      sessionTitle: comment.title || 'Untitled Plan',
      author: tokenData.display_name || tokenData.github_username,
      anchor: comment.anchor,
      planUrl,
    }).catch(console.error);
  });

  res.json({ id: commentId, resolved: 1 });
}
