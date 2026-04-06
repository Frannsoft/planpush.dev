import { escHtml } from '../utils/html.js';

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

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// --- Stats bar ---
export function renderStatsBar(stats, isAdmin) {
  return `
  <div class="stats">
    <div class="stat">
      <div class="stat-value" id="stat-sessions">${stats.sessionCount}</div>
      <div class="stat-label">${isAdmin ? 'Sessions' : 'My Sessions'}</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="stat-open-comments">${stats.openComments}</div>
      <div class="stat-label">${isAdmin ? 'Open Comments' : 'My Open Comments'}</div>
    </div>
    ${stats.newCount > 0 ? `
    <div class="stat">
      <div class="stat-value accent" id="stat-new">${stats.newCount}</div>
      <div class="stat-label">Updated Since You Last Looked</div>
      <div class="stat-hint">Sessions with new pushes or comments</div>
    </div>` : ''}
    ${isAdmin ? `
    <div class="stat">
      <div class="stat-value">${stats.memberCount}</div>
      <div class="stat-label">Members</div>
    </div>` : ''}
    <div class="stat">
      <div class="stat-value">${stats.tokenCount}</div>
      <div class="stat-label">CLI Connections</div>
      <div class="stat-hint">Active Claude Code plugin sessions</div>
    </div>
  </div>`;
}

// --- Tab bar ---
export function renderTabBar(isAdmin, stats, myCommentsCount, activityCount) {
  return `
  <nav class="tab-bar" role="tablist">
    <button class="tab-btn active" data-tab="sessions" role="tab" aria-selected="true">Sessions<span class="tab-count">${stats.sessionCount}</span></button>
    <button class="tab-btn" data-tab="activity" role="tab">Activity<span class="tab-count">${activityCount}</span></button>
    <button class="tab-btn" data-tab="comments" role="tab">My Comments<span class="tab-count">${myCommentsCount}</span></button>
    <button class="tab-btn" data-tab="tokens" role="tab">CLI Connections<span class="tab-count">${stats.tokenCount}</span></button>
    ${isAdmin ? `<button class="tab-btn" data-tab="members" role="tab">Members<span class="tab-count">${stats.memberCount}</span></button>` : ''}
    ${isAdmin ? '<button class="tab-btn" data-tab="integrations" role="tab">Integrations</button>' : ''}
  </nav>`;
}

// --- Filter toolbar ---
export function renderFilterToolbar(isAdmin) {
  return `
  <div class="filter-bar">
    <input type="search" id="dash-search" class="filter-input" placeholder="Search sessions..." autocomplete="off">
    <select id="dash-status-filter" class="filter-select">
      <option value="">All status</option>
      <option value="open">Has open comments</option>
      <option value="new">New since last visit</option>
      <option value="stale">Stale (30+ days)</option>
      <option value="archived">Archived</option>
      <option value="private">Private</option>
      <option value="mine">Created by me</option>
    </select>
    <span class="filter-result-count" id="dash-result-count"></span>
  </div>`;
}

// --- Shared helpers for session badges/actions ---
function buildSessionBadges(s) {
  const badges = [];
  if (!s.published_at) badges.push('<span class="badge-private">Private</span>');
  if (s.is_new && !s.archived_at) badges.push('<span class="badge-new">New</span>');
  if (s.is_stale && !s.archived_at) badges.push('<span class="badge-stale">Stale</span>');
  if (s.archived_at) badges.push('<span class="badge-archived">Archived</span>');
  return badges.join('');
}

function buildSessionActions(s, isAdmin) {
  const actions = [];
  if ((s.is_mine || isAdmin) && !s.published_at) {
    actions.push('<button class="action-btn" data-action="publish">Publish</button>');
  }
  if (s.is_mine) {
    actions.push(`<button class="action-btn" data-action="archive">${s.archived_at ? 'Unarchive' : 'Archive'}</button>`);
  }
  if (isAdmin) {
    actions.push('<button class="action-btn action-btn-danger" data-action="delete">Delete</button>');
  }
  return actions.join(' ');
}

function sessionDataAttrs(s) {
  return `data-id="${escHtml(s.id)}"
      data-title="${escHtml(s.title || 'Untitled Plan')}"
      data-creator="${escHtml(s.creator)}"
      data-updated="${escHtml(s.last_updated || '')}"
      data-created="${escHtml(s.created_at || '')}"
      data-open-comments="${s.open_comments || 0}"
      data-comment-count="${s.comment_count || 0}"
      data-is-new="${s.is_new ? '1' : '0'}"
      data-is-stale="${s.is_stale ? '1' : '0'}"
      data-is-mine="${s.is_mine ? '1' : '0'}"
      data-archived="${s.archived_at ? '1' : '0'}"
      data-private="${s.published_at ? '0' : '1'}"`;
}

// --- Sessions table ---
export function renderSessionsSection(sessions, baseUrl, isAdmin, tokenData) {
  const rows = sessions.map(s => `
    <tr${s.archived_at ? ' class="row-archived"' : ''}
      ${sessionDataAttrs(s)}>
      <td>
        <a href="${baseUrl}/p/${s.id}" class="session-link">${escHtml(s.title || 'Untitled Plan')}</a>
        ${buildSessionBadges(s)}
      </td>
      <td class="muted">${escHtml(s.creator)}</td>
      <td class="muted">${timeAgo(s.last_updated)}</td>
      <td>${Number(s.open_comments) > 0
        ? `<span class="comment-badge">${s.open_comments}</span>`
        : '<span class="muted">0</span>'
      }</td>
      <td class="muted">${s.comment_count}</td>
      <td class="actions-cell">${buildSessionActions(s, isAdmin)}</td>
    </tr>`).join('');

  const cards = sessions.map(s => {
    const actionsHtml = buildSessionActions(s, isAdmin);
    return `
    <div class="session-card${s.archived_at ? ' row-archived' : ''}"
      ${sessionDataAttrs(s)}>
      <div class="session-card-title">
        <a href="${baseUrl}/p/${s.id}">${escHtml(s.title || 'Untitled Plan')}</a>
        ${buildSessionBadges(s)}
      </div>
      <div class="session-card-meta">
        <span>${escHtml(s.creator)}</span>
        <span>&middot;</span>
        <span>${timeAgo(s.last_updated)}</span>
        ${Number(s.open_comments) > 0 ? `<span class="comment-badge">${s.open_comments} open</span>` : ''}
      </div>
      ${actionsHtml ? `<div class="session-card-actions">${actionsHtml}</div>` : ''}
    </div>`;
  }).join('');

  const emptyHtml = isAdmin
    ? '<div class="empty"><div class="empty-title">No sessions yet</div><div class="empty-desc">Run <code>/planpush</code> in Claude Code to create your first plan.</div></div>'
    : '<div class="empty"><div class="empty-title">No sessions yet</div><div class="empty-desc">Sessions you create with <code>/planpush</code> or comment on will appear here.</div></div>';

  return `
  <div class="tab-section active" data-section="sessions">
    ${renderFilterToolbar(isAdmin)}
    ${sessions.length > 0 ? `
    <table class="desktop-table" id="sessions-table">
      <thead>
        <tr>
          <th data-sort="title">Session <span class="sort-icon">&#8597;</span></th>
          <th data-sort="creator">By <span class="sort-icon">&#8597;</span></th>
          <th data-sort="updated" class="sort-desc">Updated <span class="sort-icon">&#9660;</span></th>
          <th data-sort="open_comments">Open <span class="sort-icon">&#8597;</span></th>
          <th data-sort="comment_count">Total <span class="sort-icon">&#8597;</span></th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="sessions-tbody">${rows}</tbody>
    </table>
    <div class="mobile-sessions" id="mobile-sessions-list">${cards}</div>
    <div class="pagination" id="pagination"></div>` : emptyHtml}
    <div class="empty" id="sessions-no-results" style="display:none">
      <div class="empty-title">No matching sessions</div>
      <div class="empty-desc">Try adjusting your search or filters.</div>
    </div>
  </div>`;
}

// --- Activity feed ---
export function renderActivityFeed(activity, baseUrl) {
  const actionMeta = {
    'session.created': { icon: 'activity-icon-push', label: 'created', emoji: '&#x1F4C4;' },
    'session.updated': { icon: 'activity-icon-push', label: 'updated', emoji: '&#x1F504;' },
    'session.deleted': { icon: 'activity-icon-delete', label: 'deleted', emoji: '&#x1F5D1;' },
    'session.archived': { icon: 'activity-icon-archive', label: 'archived', emoji: '&#x1F4E6;' },
    'session.unarchived': { icon: 'activity-icon-archive', label: 'unarchived', emoji: '&#x1F4E6;' },
    'session.published': { icon: 'activity-icon-push', label: 'published', emoji: '&#x1F513;' },
    'comment.created': { icon: 'activity-icon-comment', label: 'commented on', emoji: '&#x1F4AC;' },
    'comment.resolved': { icon: 'activity-icon-resolve', label: 'resolved a comment on', emoji: '&#x2705;' },
    'token.revoked': { icon: 'activity-icon-delete', label: 'revoked a token', emoji: '&#x1F511;' },
    'user.role_changed': { icon: 'activity-icon-user', label: 'changed role for', emoji: '&#x1F464;' },
    'user.deactivated': { icon: 'activity-icon-delete', label: 'deactivated', emoji: '&#x26D4;' },
    'user.reactivated': { icon: 'activity-icon-user', label: 'reactivated', emoji: '&#x2705;' },
  };

  const items = activity.map(a => {
    const meta = actionMeta[a.action] || { icon: 'activity-icon-push', label: a.action, emoji: '&#x2022;' };
    const actor = a.actor_display_name || a.actor_github_username || 'System';
    let parsedMeta = {};
    try { parsedMeta = a.meta ? JSON.parse(a.meta) : {}; } catch { /* ignore */ }

    let targetHtml = '';
    if (a.target_type === 'session' && a.target_id) {
      const title = parsedMeta.title || a.target_id;
      targetHtml = ` <a href="${baseUrl}/p/${escHtml(a.target_id)}" class="activity-target">${escHtml(title)}</a>`;
    } else if (parsedMeta.github_username) {
      targetHtml = ` <strong>${escHtml(parsedMeta.github_username)}</strong>`;
    }

    return `
    <li class="activity-item">
      <div class="activity-icon ${meta.icon}">${meta.emoji}</div>
      <div class="activity-body">
        <div><span class="activity-actor">${escHtml(actor)}</span> ${escHtml(meta.label)}${targetHtml}</div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>
    </li>`;
  }).join('');

  return `
  <div class="tab-section" data-section="activity">
    ${activity.length > 0
      ? `<ul class="activity-list">${items}</ul>`
      : '<div class="empty"><div class="empty-title">No activity yet</div><div class="empty-desc">Activity on your sessions will appear here as people push updates, comment, and resolve discussions.</div></div>'
    }
  </div>`;
}

// --- My Comments ---
export function renderMyComments(comments, baseUrl) {
  if (comments.length === 0) {
    return `
    <div class="tab-section" data-section="comments">
      <div class="empty">
        <div class="empty-title">No comments yet</div>
        <div class="empty-desc">When you comment on plans, they will appear here so you can track their resolution status.</div>
      </div>
    </div>`;
  }

  const rows = comments.map(c => `
    <tr>
      <td><a href="${baseUrl}/p/${escHtml(c.session_id)}" class="session-link">${escHtml(c.session_title || 'Untitled Plan')}</a></td>
      <td class="comment-excerpt">${escHtml(truncate(c.content, 80))}</td>
      <td>${c.resolved
        ? '<span class="badge-resolved">Resolved</span>'
        : '<span class="badge-open">Open</span>'
      }</td>
      <td class="muted">${timeAgo(c.created_at)}</td>
    </tr>`).join('');

  return `
  <div class="tab-section" data-section="comments">
    <table>
      <thead><tr><th>Session</th><th>Comment</th><th>Status</th><th>Posted</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// --- CLI Connections (Tokens) ---
export function renderTokenSection(tokens) {
  if (tokens.length === 0) {
    return `
    <div class="tab-section" data-section="tokens">
      <div class="empty">
        <div class="empty-title">No CLI connections</div>
        <div class="empty-desc">When you run <code>/planpush</code> in Claude Code, a connection is created automatically so the plugin can push plans on your behalf.</div>
      </div>
    </div>`;
  }

  const rows = tokens.map(t => `
    <tr data-token-id="${escHtml(t.id)}">
      <td class="token-label">${escHtml(t.label || 'Claude Code')}</td>
      <td class="muted">${timeAgo(t.issued_at)}</td>
      <td class="muted">${t.last_used_at ? timeAgo(t.last_used_at) : 'Never'}</td>
      <td><button class="action-btn action-btn-danger" data-action="revoke-token">Revoke</button></td>
    </tr>`).join('');

  return `
  <div class="tab-section" data-section="tokens">
    <p class="section-desc">These are active connections from the Claude Code plugin. Revoking a connection will require re-authenticating next time you run <code>/planpush</code>.</p>
    <table>
      <thead><tr><th>Connection</th><th>Connected</th><th>Last Used</th><th>Actions</th></tr></thead>
      <tbody id="tokens-tbody">${rows}</tbody>
    </table>
  </div>`;
}

// --- Members (admin only) ---
export function renderMembersSection(members) {
  const rows = members.map(m => `
    <tr>
      <td>
        ${m.avatar_url ? `<img src="${escHtml(m.avatar_url)}" width="20" height="20" style="border-radius:50%;vertical-align:middle;margin-right:6px">` : ''}
        ${escHtml(m.display_name || m.github_username)}
        ${m.role === 'admin' ? '<span class="badge-admin">Admin</span>' : ''}
        ${m.deactivated_at ? '<span class="badge-deactivated">Deactivated</span>' : ''}
      </td>
      <td class="muted">${escHtml(m.github_username)}</td>
      <td class="muted">${timeAgo(m.joined_at)}</td>
    </tr>`).join('');

  return `
  <div class="tab-section" data-section="members">
    <table>
      <thead><tr><th>User</th><th>GitHub</th><th>Joined</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:12px;color:var(--pp-text-muted);margin-top:8px">Members are managed via your GitHub organization. Anyone in the org can sign in.</p>
  </div>`;
}

// --- Integrations (admin only) ---
export function renderIntegrationsSection() {
  const slackConfigured = !!(process.env.SLACK_WEBHOOK_URL || '').trim();

  return `
  <div class="tab-section" data-section="integrations">
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
          <span class="card-status" style="display:block;font-size:12px;color:${slackConfigured ? 'var(--pp-success)' : 'var(--pp-text-muted)'}">${slackConfigured ? 'Configured via environment variable' : 'Not configured'}</span>
        </div>
      </div>
      <p class="card-desc">${slackConfigured
        ? 'Slack notifications are active. Comment, resolve, and plan update events will be posted.'
        : 'Set the <code>SLACK_WEBHOOK_URL</code> environment variable to enable Slack notifications.'
      }</p>
    </div>
  </div>`;
}
