import { BASE_PAGE_CSS, HEADER_CSS, LOGOUT_JS, THEME_FLASH_SCRIPT, buildHeaderHTML } from '../utils/html.js';
import { DASHBOARD_CSS } from './css.js';
import { DASHBOARD_JS } from './client.js';
import {
  renderStatsBar, renderTabBar, renderSessionsSection,
  renderActivityFeed, renderMyComments, renderTokenSection,
  renderMembersSection, renderIntegrationsSection, renderSettingsSection,
} from './sections.js';

export function dashboardPage(data, baseUrl, tokenData, userPermissions) {
  const { sessions, members, myComments, activity, tokens, stats } = data;
  const userName = tokenData.display_name || tokenData.github_username || '';
  const isAdmin = userPermissions && userPermissions.includes('session_view_private');
  const hasUserManage = userPermissions && userPermissions.includes('user_manage');

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
${THEME_FLASH_SCRIPT}
<style>
  ${BASE_PAGE_CSS}
  ${HEADER_CSS}
  ${DASHBOARD_CSS}
</style>
</head>
<body>

<div id="pp-header">
  ${headerContent}
</div>

<main>
  ${renderStatsBar(stats, userPermissions)}
  ${renderTabBar(userPermissions, stats, myComments.length, activity.length)}
  ${renderSessionsSection(sessions, baseUrl, userPermissions, tokenData)}
  ${renderActivityFeed(activity, baseUrl)}
  ${renderMyComments(myComments, baseUrl)}
  ${renderTokenSection(tokens)}
  ${isAdmin ? renderMembersSection(members) : ''}
  ${isAdmin ? renderIntegrationsSection() : ''}
  ${hasUserManage ? renderSettingsSection() : ''}
</main>

<footer>&copy; ${new Date().getFullYear()} PlanPush</footer>

<script>
${LOGOUT_JS}
${DASHBOARD_JS}
</script>

</body>
</html>`;
}
