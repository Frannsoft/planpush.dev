import { knex } from '../db.js';
import { escHtml, buildHeaderHTML, HEADER_CSS, LOGOUT_JS, BASE_PAGE_CSS } from '../utils/html.js';

export async function handleDashboard(req, res) {
  const tokenData = req.tokenData; // populated by requireAuthOrRedirect middleware
  const isAdmin = tokenData.role === 'admin';
  const baseUrl = req.planpushBaseUrl;

  let sessions, members;

  if (isAdmin) {
    sessions = await knex('sessions as s')
      .leftJoin('users as u', 's.created_by', 'u.id')
      .leftJoin('comments as c', 'c.session_id', 's.id')
      .select(
        's.id', 's.title', 's.created_by', 's.created_at', 's.last_updated',
        knex.raw("COALESCE(u.display_name, u.github_username, 'Deleted user') as creator"),
        knex.raw('COALESCE(COUNT(c.id), 0) as comment_count'),
        knex.raw('COALESCE(SUM(CASE WHEN c.resolved = 0 THEN 1 ELSE 0 END), 0) as open_comments'),
      )
      .groupBy('s.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 'u.display_name', 'u.github_username')
      .orderBy('s.last_updated', 'desc');

    members = await knex('users')
      .select('id', 'github_username', 'display_name', 'avatar_url', 'role', 'joined_at');
  } else {
    sessions = await knex('sessions as s')
      .leftJoin('users as u', 's.created_by', 'u.id')
      .join('comments as c', function() {
        this.on('c.session_id', 's.id').andOn('c.author_id', knex.raw('?', [tokenData.user_id]));
      })
      .select(
        's.id', 's.title', 's.created_by', 's.created_at', 's.last_updated',
        knex.raw("COALESCE(u.display_name, u.github_username, 'Deleted user') as creator"),
        knex.raw('COALESCE(COUNT(c.id), 0) as comment_count'),
        knex.raw('COALESCE(SUM(CASE WHEN c.resolved = 0 THEN 1 ELSE 0 END), 0) as open_comments'),
      )
      .groupBy('s.id', 's.title', 's.created_by', 's.created_at', 's.last_updated', 'u.display_name', 'u.github_username')
      .orderBy('s.last_updated', 'desc');

    members = [];
  }

  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'X-Frame-Options': 'DENY',
  }).send(
    dashboardPage(sessions || [], members || [], baseUrl, tokenData, isAdmin)
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'unknown';
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function dashboardPage(sessions, members, baseUrl, tokenData, isAdmin) {
  const userName = tokenData.display_name || tokenData.github_username || '';

  const sessionRows = sessions.map(s => `
    <tr>
      <td><a href="${baseUrl}/p/${s.id}" class="session-link">${escHtml(s.title || 'Untitled Plan')}</a></td>
      <td class="muted">${escHtml(s.creator)}</td>
      <td class="muted">${timeAgo(s.last_updated)}</td>
      <td>${s.open_comments > 0
        ? `<span class="comment-badge">${s.open_comments}</span>`
        : `<span class="muted">0</span>`
      }</td>
      <td class="muted">${s.comment_count}</td>
    </tr>`).join('');

  const sessionCards = sessions.map(s => `
    <div class="session-card">
      <div class="session-card-title"><a href="${baseUrl}/p/${s.id}">${escHtml(s.title || 'Untitled Plan')}</a></div>
      <div class="session-card-meta">
        <span>${escHtml(s.creator)}</span>
        <span>·</span>
        <span>${timeAgo(s.last_updated)}</span>
        ${s.open_comments > 0 ? `<span class="comment-badge">${s.open_comments} open</span>` : ''}
      </div>
    </div>`).join('');

  const memberRows = isAdmin ? members.map(m => `
    <tr>
      <td>
        ${m.avatar_url ? `<img src="${escHtml(m.avatar_url)}" width="20" height="20" style="border-radius:50%;vertical-align:middle;margin-right:6px">` : ''}
        ${escHtml(m.display_name || m.github_username)}
        ${m.role === 'admin' ? '<span class="badge badge-admin">Admin</span>' : ''}
      </td>
      <td class="muted">${escHtml(m.github_username)}</td>
      <td class="muted">${timeAgo(m.joined_at)}</td>
    </tr>`).join('') : '';

  const headerContent = buildHeaderHTML({ displayName: userName, userId: tokenData.github_user_id, apiOrigin: baseUrl, showDashboardLink: false });

  const slackConfigured = !!(process.env.SLACK_WEBHOOK_URL || '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Dashboard</title>
<style>
  ${BASE_PAGE_CSS}
  :root {
    /* Aliases for shared header */
    --pp-bg: var(--bg); --pp-surface-1: var(--bg2); --pp-border: var(--border);
    --pp-text: var(--text); --pp-text-muted: var(--muted); --pp-accent: var(--accent);
    --pp-accent-soft: var(--accent-bg); --pp-success: var(--success);
    --pp-accent-hover: var(--accent-hover);
  }
  body { min-height: 100vh; display: flex; flex-direction: column; padding-top: 48px; }

  ${HEADER_CSS}
  @media(prefers-color-scheme:dark){.pp-header-btn:hover{background:var(--bg3,#1c2128)}}

  main { max-width: 960px; margin: 0 auto; padding: 32px 24px; flex: 1; width: 100%; }

  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; }

  table { width: 100%; border-collapse: collapse; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
  th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 10px 16px; background: var(--bg3); border-bottom: 1px solid var(--border); }
  td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg2); }
  .muted { color: var(--muted); }

  .session-link { color: var(--accent); text-decoration: none; font-weight: 600; transition: color .15s; }
  .session-link:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 2px; }
  .comment-badge { background: var(--accent-bg); color: var(--accent); padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .empty { text-align: center; padding: 48px 24px; color: var(--muted); font-size: 13px; }

  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .stat { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; box-shadow: var(--shadow-sm); transition: box-shadow .15s; }
  .stat:hover { box-shadow: var(--shadow-md); }
  .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; font-weight: 600; }

  .badge-admin { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: var(--success-bg); color: var(--success); margin-left: 8px; letter-spacing: 0.02em; }

  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow-sm); }
  .card-header { display: flex; align-items: center; gap: 12px; }
  .card-desc { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.6; }

  footer { background: var(--bg2); border-top: 1px solid var(--border); padding: 18px 24px; text-align: center; font-size: 11px; color: var(--muted); letter-spacing: 0.02em; }

  /* Mobile session cards */
  .mobile-sessions { display: none; }
  .session-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--shadow-sm); }
  .session-card-title { font-weight: 600; margin-bottom: 4px; }
  .session-card-title a { color: var(--accent); text-decoration: none; font-size: 14px; }
  .session-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); align-items: center; }
  .session-card-meta .comment-badge { font-size: 10px; padding: 1px 6px; }

  @media (max-width: 640px) {
    main { padding: 16px; }
    .stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .stat { padding: 12px; }
    .stat-value { font-size: 22px; }
    .desktop-table { display: none; }
    .mobile-sessions { display: block; }
    th, td { padding: 8px 12px; }
  }
</style>
</head>
<body>

<div id="pp-header">
  ${headerContent}
</div>

<main>
  <div class="stats">
    <div class="stat">
      <div class="stat-value">${sessions.length}</div>
      <div class="stat-label">${isAdmin ? 'Sessions' : 'My Sessions'}</div>
    </div>
    <div class="stat">
      <div class="stat-value">${sessions.reduce((sum, s) => sum + (s.open_comments || 0), 0)}</div>
      <div class="stat-label">${isAdmin ? 'Open Comments' : 'My Open Comments'}</div>
    </div>
    ${isAdmin ? `
    <div class="stat">
      <div class="stat-value">${members.length}</div>
      <div class="stat-label">Members</div>
    </div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">${isAdmin ? 'Sessions' : 'My Sessions'}</div>
    ${sessions.length > 0 ? `
    <table class="desktop-table">
      <thead>
        <tr><th>Session</th><th>By</th><th>Updated</th><th>Open</th><th>Total</th></tr>
      </thead>
      <tbody>${sessionRows}</tbody>
    </table>
    <div class="mobile-sessions">${sessionCards}</div>` : `<div class="empty">${isAdmin ? 'No sessions yet. Run <code>/planpush</code> to create your first plan.' : 'No sessions with your comments yet.'}</div>`}
  </div>

  ${isAdmin ? `
  <div class="section">
    <div class="section-title">Members</div>
    <table>
      <thead><tr><th>User</th><th>GitHub</th><th>Joined</th></tr></thead>
      <tbody>${memberRows}</tbody>
    </table>
    <p style="font-size:12px;color:var(--muted);margin-top:8px">Members are managed via your GitHub organization. Anyone in the org can sign in.</p>
  </div>` : ''}

  ${isAdmin ? `
  <div class="section">
    <div class="section-title">Integrations</div>
    <div class="card">
      <div class="card-header">
        <svg width="20" height="20" viewBox="0 0 127 127" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
          <path d="M27.2 80a13.6 13.6 0 1 1 0-27.2h13.6V80H27.2zm6.8 0a13.6 13.6 0 1 1 27.2 0v34a13.6 13.6 0 1 1-27.2 0V80z" fill="#E01E5A"/>
          <path d="M47.6 27.2a13.6 13.6 0 1 1 27.2 0v13.6H47.6V27.2zm0 6.8a13.6 13.6 0 1 1 0 27.2H13.6a13.6 13.6 0 0 1 0-27.2h34z" fill="#36C5F0"/>
          <path d="M100 47.6a13.6 13.6 0 1 1 0 27.2H86.4V47.6H100zm-6.8 0a13.6 13.6 0 1 1-27.2 0V13.6a13.6 13.6 0 1 1 27.2 0v34z" fill="#2EB67D"/>
          <path d="M79.6 100a13.6 13.6 0 1 1-27.2 0V86.4h27.2V100zm0-6.8a13.6 13.6 0 1 1 0-27.2h34a13.6 13.6 0 1 1 0 27.2h-34z" fill="#ECB22E"/>
        </svg>
        <div>
          <strong>Slack</strong>
          <span class="card-status" style="display:block;font-size:12px;color:${slackConfigured ? 'var(--success)' : 'var(--muted)'}">${slackConfigured ? 'Configured via environment variable' : 'Not configured'}</span>
        </div>
      </div>
      <p class="card-desc">${slackConfigured
        ? 'Slack notifications are active. Comment, resolve, and plan update events will be posted.'
        : 'Set the <code>SLACK_WEBHOOK_URL</code> environment variable to enable Slack notifications.'
      }</p>
    </div>
  </div>` : ''}
</main>

<footer>&copy; ${new Date().getFullYear()} PlanPush</footer>

<script>
${LOGOUT_JS}
</script>

</body>
</html>`;
}
