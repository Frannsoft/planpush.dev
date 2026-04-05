import { knex } from '../db.js';
import { canAccessSession } from '../utils/visibility.js';
import { isValidSessionId } from '../utils/validate.js';

// GET /api/sessions/:id/info
export async function handleSessionInfo(req, res) {
  const sessionId = req.params.id;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'invalid_session_id' });
  }

  const session = await knex('sessions as s')
    .leftJoin('users as u', 's.created_by', 'u.id')
    .where('s.id', sessionId)
    .whereNull('s.deleted_at')
    .select(
      's.id', 's.title', 's.current_version', 's.created_at', 's.last_updated', 's.published_at', 's.created_by',
      'u.github_username as creator_github_username',
      'u.display_name as creator_display_name',
      'u.avatar_url as creator_avatar_url',
      'u.github_user_id as creator_github_id',
    )
    .first();

  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  const user = await knex('users').where({ id: req.tokenData.user_id }).select('role').first();
  if (!canAccessSession(session, req.tokenData, user?.role)) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  // Fetch version history, comment stats, and recent comments in parallel
  const [versions, stats, comments] = await Promise.all([
    knex('session_versions as sv')
      .leftJoin('users as u', 'sv.pushed_by', 'u.id')
      .where('sv.session_id', sessionId)
      .select(
        'sv.version', 'sv.pushed_at',
        'u.display_name as pushed_by_name',
        'u.github_username as pushed_by_username',
        'u.avatar_url as pushed_by_avatar',
      )
      .orderBy('sv.version', 'desc')
      .limit(200),

    knex('comments')
      .where('session_id', sessionId)
      .select(
        knex.raw('COUNT(*) as total'),
        knex.raw('COALESCE(SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END), 0) as open'),
        knex.raw('COALESCE(SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END), 0) as resolved'),
      )
      .first(),

    knex('comments as c')
      .join('users as u', 'c.author_id', 'u.id')
      .where('c.session_id', sessionId)
      .select(
        'c.id', 'c.content', 'c.anchor', 'c.resolved', 'c.created_at',
        'c.resolved_at', 'c.plan_version',
        'u.display_name as author_name',
        'u.github_username as author_username',
        'u.avatar_url as author_avatar',
      )
      .orderBy('c.created_at', 'desc')
      .limit(100),
  ]);

  // Build activity feed: interleave version pushes + comments, newest first, limit 50
  const versionActivity = versions.map(v => ({
    type: 'push',
    version: v.version,
    author: v.pushed_by_name || v.pushed_by_username || 'Unknown',
    avatar: v.pushed_by_avatar || null,
    timestamp: v.pushed_at,
  }));

  const commentActivity = [];
  for (const c of comments) {
    // Always show the original comment event
    commentActivity.push({
      type: 'comment',
      author: c.author_name || c.author_username || 'Unknown',
      avatar: c.author_avatar || null,
      content: c.content ? (c.content.length > 120 ? c.content.slice(0, 120) + '...' : c.content) : '',
      anchor: c.anchor || null,
      timestamp: c.created_at,
    });
    // If resolved, also show a resolve event
    if (c.resolved && c.resolved_at) {
      commentActivity.push({
        type: 'resolve',
        author: c.author_name || c.author_username || 'Unknown',
        avatar: c.author_avatar || null,
        content: '',
        anchor: c.anchor || null,
        timestamp: c.resolved_at,
      });
    }
  }

  const activity = [...versionActivity, ...commentActivity]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);

  res.json({
    session: {
      id: session.id,
      title: session.title,
      current_version: session.current_version,
      created_at: session.created_at,
      last_updated: session.last_updated,
      published_at: session.published_at,
      creator: {
        display_name: session.creator_display_name,
        github_username: session.creator_github_username,
        avatar_url: session.creator_avatar_url,
        github_id: session.creator_github_id,
      },
    },
    versions,
    comment_stats: {
      total: Number(stats?.total || 0),
      open: Number(stats?.open || 0),
      resolved: Number(stats?.resolved || 0),
    },
    activity,
  });
}
