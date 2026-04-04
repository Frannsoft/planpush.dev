import { knex } from '../db.js';

export async function fetchDashboardData(tokenData, isAdmin) {
  const userId = tokenData.user_id;

  // --- Phase 1: parallel queries ---
  const queries = [];

  // Sessions query (admin sees all, member sees own + commented-on)
  if (isAdmin) {
    queries.push(
      knex('sessions as s')
        .leftJoin('users as u', 's.created_by', 'u.id')
        .leftJoin('comments as c', 'c.session_id', 's.id')
        .whereNull('s.deleted_at')
        .select(
          's.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 's.archived_at', 's.published_at',
          knex.raw("COALESCE(u.display_name, u.github_username, 'Deleted user') as creator"),
          knex.raw('COALESCE(COUNT(c.id), 0) as comment_count'),
          knex.raw('COALESCE(SUM(CASE WHEN c.resolved = 0 THEN 1 ELSE 0 END), 0) as open_comments'),
        )
        .groupBy('s.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 's.archived_at', 's.published_at', 'u.display_name', 'u.github_username')
        .orderBy('s.last_updated', 'desc')
        .limit(200),
    );
  } else {
    queries.push(
      knex('sessions as s')
        .leftJoin('users as u', 's.created_by', 'u.id')
        .leftJoin('comments as c', 'c.session_id', 's.id')
        .whereNull('s.deleted_at')
        .where(function () {
          this.where('s.created_by', userId)
            .orWhere(function () {
              this.whereIn('s.id', knex('comments').where('author_id', userId).distinct('session_id'))
                .whereNotNull('s.published_at');
            });
        })
        .select(
          's.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 's.archived_at', 's.published_at',
          knex.raw("COALESCE(u.display_name, u.github_username, 'Deleted user') as creator"),
          knex.raw('COALESCE(COUNT(c.id), 0) as comment_count'),
          knex.raw('COALESCE(SUM(CASE WHEN c.resolved = 0 THEN 1 ELSE 0 END), 0) as open_comments'),
        )
        .groupBy('s.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 's.archived_at', 's.published_at', 'u.display_name', 'u.github_username')
        .orderBy('s.last_updated', 'desc')
        .limit(200),
    );
  }

  // Members query (admin only)
  if (isAdmin) {
    queries.push(
      knex('users')
        .select('id', 'github_username', 'display_name', 'avatar_url', 'role', 'joined_at', 'deactivated_at')
        .orderBy('joined_at', 'desc')
        .limit(500),
    );
  } else {
    queries.push(Promise.resolve([]));
  }

  // My comments query
  queries.push(
    knex('comments as c')
      .join('sessions as s', 'c.session_id', 's.id')
      .leftJoin('users as u', 's.created_by', 'u.id')
      .where('c.author_id', userId)
      .whereNull('s.deleted_at')
      .select(
        'c.id', 'c.content', 'c.resolved', 'c.created_at', 'c.resolved_at',
        's.id as session_id', 's.title as session_title',
        knex.raw("COALESCE(u.display_name, u.github_username, 'Deleted user') as session_creator"),
      )
      .orderBy('c.resolved', 'asc')
      .orderBy('c.created_at', 'desc')
      .limit(100),
  );

  // Tokens query
  queries.push(
    knex('api_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .select('id', 'label', 'issued_at', 'last_used_at')
      .orderBy('issued_at', 'desc'),
  );

  const [sessions, members, myComments, tokens] = await Promise.all(queries);

  // --- Phase 2: queries that depend on sessions ---
  const sessionIds = sessions.map(s => s.id);

  const [sessionViews, activity] = await Promise.all([
    // Session views for "new since last visit"
    sessionIds.length > 0
      ? knex('session_views')
        .where({ user_id: userId })
        .whereIn('session_id', sessionIds)
        .select('session_id', 'last_viewed_at')
      : Promise.resolve([]),

    // Activity feed
    buildActivityQuery(sessionIds, isAdmin, userId),
  ]);

  // --- Compute derived data ---
  const viewedAtMap = new Map(sessionViews.map(v => [v.session_id, v.last_viewed_at]));

  const enrichedSessions = sessions.map(s => {
    const viewedAt = viewedAtMap.get(s.id);
    const daysSinceUpdate = (Date.now() - new Date(s.last_updated).getTime()) / 86400000;
    const isNew = !viewedAt || new Date(s.last_updated) > new Date(viewedAt);
    return {
      ...s,
      is_new: isNew,
      is_stale: daysSinceUpdate >= 30,
      is_mine: s.created_by === userId,
    };
  });

  const stats = {
    sessionCount: sessions.filter(s => !s.archived_at).length,
    openComments: sessions.filter(s => !s.archived_at).reduce((sum, s) => sum + (Number(s.open_comments) || 0), 0),
    newCount: enrichedSessions.filter(s => s.is_new && !s.archived_at).length,
    memberCount: members.length,
    tokenCount: tokens.length,
  };

  return { sessions: enrichedSessions, members, myComments, activity, tokens, stats };
}

function buildActivityQuery(sessionIds, isAdmin, userId) {
  let query = knex('audit_log as a')
    .leftJoin('users as u', 'a.actor_id', 'u.id')
    .select(
      'a.id', 'a.action', 'a.target_type', 'a.target_id', 'a.meta', 'a.created_at',
      'u.display_name as actor_display_name', 'u.github_username as actor_github_username',
    )
    .orderBy('a.created_at', 'desc')
    .limit(30);

  if (!isAdmin) {
    if (sessionIds.length === 0) return Promise.resolve([]);
    query = query.where('a.target_type', 'session').whereIn('a.target_id', sessionIds);
  }

  return query;
}

export async function recordSessionViews(userId, sessionIds) {
  if (!sessionIds.length) return;
  const validIds = sessionIds.filter(id => typeof id === 'string').slice(0, 200);
  const now = new Date().toISOString();

  await knex('session_views')
    .insert(validIds.map(session_id => ({ user_id: userId, session_id, last_viewed_at: now })))
    .onConflict(['user_id', 'session_id'])
    .merge({ last_viewed_at: now });
}
