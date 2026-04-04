import { BASE_PAGE_CSS, HEADER_CSS, LOGOUT_JS, buildHeaderHTML } from '../utils/html.js';
import { DASHBOARD_CSS } from './css.js';
import { DASHBOARD_JS } from './client.js';
import {
  renderStatsBar, renderTabBar, renderSessionsSection,
  renderActivityFeed, renderMyComments, renderTokenSection,
  renderMembersSection, renderIntegrationsSection,
} from './sections.js';

export function dashboardPage(data, baseUrl, tokenData, isAdmin) {
  const { sessions, members, myComments, activity, tokens, stats } = data;
  const userName = tokenData.display_name || tokenData.github_username || '';

  const headerContent = buildHeaderHTML({
    displayName: userName,
    userId: tokenData.github_user_id,
    apiOrigin: baseUrl,
    showDashboardLink: false,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlanPush — Dashboard</title>
<style>
  ${BASE_PAGE_CSS}
  :root {
    --pp-bg: var(--bg); --pp-surface-1: var(--bg2); --pp-border: var(--border);
    --pp-text: var(--text); --pp-text-muted: var(--muted); --pp-accent: var(--accent);
    --pp-accent-soft: var(--accent-bg); --pp-success: var(--success);
    --pp-accent-hover: var(--accent-hover);
  }
  ${HEADER_CSS}
  ${DASHBOARD_CSS}
</style>
</head>
<body>

<div id="pp-header">
  ${headerContent}
</div>

<main>
  ${renderStatsBar(stats, isAdmin)}
  ${renderTabBar(isAdmin, stats, myComments.length, activity.length)}
  ${renderSessionsSection(sessions, baseUrl, isAdmin, tokenData)}
  ${renderActivityFeed(activity, baseUrl)}
  ${renderMyComments(myComments, baseUrl)}
  ${renderTokenSection(tokens)}
  ${isAdmin ? renderMembersSection(members) : ''}
  ${isAdmin ? renderIntegrationsSection() : ''}
</main>

<footer>&copy; ${new Date().getFullYear()} PlanPush</footer>

<script>
${LOGOUT_JS}
${DASHBOARD_JS}
</script>

</body>
</html>`;
}
