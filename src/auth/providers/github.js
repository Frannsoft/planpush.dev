// GitHub OAuth provider

function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(timer));
}

export default {
  name: 'github',

  // Get user profile (id, login, name, avatar_url)
  async getUser(token) {
    const resp = await fetchWithTimeout('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'PlanPush',
      },
    });

    if (!resp.ok) throw new Error('Failed to fetch GitHub user profile');
    return resp.json();
  },

  // Get verified primary email
  async getEmail(token) {
    const resp = await fetchWithTimeout('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'PlanPush',
      },
    });

    if (!resp.ok) return null;
    const emails = await resp.json();
    // Find primary verified email
    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email || null;
  },

  // Check organization membership (if org is configured)
  async checkOrgMembership(username, org, token) {
    if (!org) return true;
    const resp = await fetchWithTimeout(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'PlanPush',
        },
      }
    );
    // 204 = member, 302/404 = not a member
    return resp.status === 204;
  },

  // OAuth config from environment
  getOAuthConfig() {
    return {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      org: process.env.GITHUB_ORG || null,
    };
  },
};
