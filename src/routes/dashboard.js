import { fetchDashboardData } from '../dashboard/queries.js';
import { dashboardPage } from '../dashboard/page.js';

export async function handleDashboard(req, res) {
  const tokenData = req.tokenData;
  const isAdmin = tokenData.role === 'admin';
  const baseUrl = req.planpushBaseUrl;

  const data = await fetchDashboardData(tokenData, isAdmin);

  res.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'",
  }).send(
    dashboardPage(data, baseUrl, tokenData, isAdmin)
  );
}
