import { getUserPermissions } from '../utils/rbac.js';
import { fetchDashboardData } from '../dashboard/queries.js';
import { dashboardPage } from '../dashboard/page.js';

export async function handleDashboard(req, res) {
  const tokenData = req.tokenData;
  const userPerms = await getUserPermissions(tokenData.user_id);
  const baseUrl = req.planpushBaseUrl;

  const data = await fetchDashboardData(tokenData, userPerms);

  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'",
  }).send(
    dashboardPage(data, baseUrl, tokenData, userPerms)
  );
}
