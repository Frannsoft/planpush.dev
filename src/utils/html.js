// Shared HTML escaping utilities

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validate redirect_url to prevent open redirects — only same-origin paths allowed
export function safeRedirectUrl(raw, fallback = '/dashboard') {
  if (!raw) return fallback;
  try {
    const u = new URL(raw, 'https://placeholder.invalid');
    if (u.hostname !== 'placeholder.invalid') return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

// Shared design tokens + reset CSS used by all standalone HTML pages
export const BASE_PAGE_CSS = `
  :root { --bg: #fff; --text: #1a1d23; --muted: #57606a; --border: #e1e4e8; --accent: #0969da; --accent-bg: #dbeafe; --error: #cf222e; --success: #1a7f37; --success-bg: #dafbe1; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --text: #e6edf3; --muted: #8d96a0; --border: #30363d; --accent: #58a6ff; --accent-bg: #121d2f; --error: #f85149; --success: #3fb950; --success-bg: #0f2d1b; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6; }`;

// Build reusable header bar HTML
export function buildHeaderHTML({ displayName, userId, apiOrigin, showDashboardLink = true }) {
  const userName = displayName ? escHtml(displayName) : (userId ? escHtml(userId) : '');
  const dashboardLink = showDashboardLink ? `
    <a class="pp-header-btn" href="${escHtml(apiOrigin || '')}/dashboard" title="Dashboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </a>` : '';

  return `
  <div id="pp-header-inner">
    <div id="pp-header-left">
      <a id="pp-header-logo" href="${escHtml(apiOrigin || '')}/dashboard">
        <img src="/assets/logo.png" alt="PlanPush" width="22" height="22" style="flex-shrink:0">
        PlanPush
      </a>
    </div>
    <div id="pp-header-right">
      <button id="pp-share-btn" class="pp-header-btn" title="Copy link" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
      <button id="pp-info-btn" class="pp-header-btn" title="Plan info" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      </button>
      <span id="pp-header-user">${userName}</span>
      ${dashboardLink}
      <button id="pp-logout-btn" class="pp-header-btn" title="Sign out">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </div>`;
}

// Shared header CSS (used by both dashboard and overlay)
export const HEADER_CSS = `
#pp-header{position:fixed;top:0;left:0;right:0;height:44px;background:var(--pp-bg,#fff);border-bottom:1px solid var(--pp-border,#d0d7de);z-index:100001;padding:0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:var(--pp-text,#1a1d23);box-shadow:0 1px 3px rgba(0,0,0,.06)}
#pp-header-inner{max-width:1100px;margin:0 auto;height:100%;display:flex;align-items:center;justify-content:space-between;padding:0 24px}
@media(prefers-color-scheme:dark){#pp-header{box-shadow:0 1px 3px rgba(0,0,0,.3)}}
#pp-header-left{display:flex;align-items:center;gap:10px}
#pp-header-logo{display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:var(--pp-text,#1a1d23);text-decoration:none}
#pp-header-logo:hover{opacity:.8}
#pp-header-right{display:flex;align-items:center;gap:12px}
#pp-header-user{font-size:12px;color:var(--pp-text-muted,#57606a)}
.pp-header-btn{display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;color:var(--pp-text-muted,#57606a);font-size:12px;font-family:inherit;padding:4px 8px;border-radius:4px;text-decoration:none}
.pp-header-btn:hover{background:var(--pp-surface-1,#f6f8fa);color:var(--pp-text,#1a1d23)}
.pp-header-btn svg{width:16px;height:16px;flex-shrink:0}`;

// Logout JS — posts to /auth/logout then redirects
export const LOGOUT_JS = `
(function() {
  var btn = document.getElementById('pp-logout-btn');
  if (btn) btn.addEventListener('click', function() {
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(function() { window.location.href = '/auth/login'; });
  });
})();`;
