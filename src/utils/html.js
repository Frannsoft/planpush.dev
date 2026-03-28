// Shared HTML escaping utilities

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(str) {
  return escHtml(str);
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

// PlanPush logo as base64 PNG (32x32 favicon)
export const LOGO_B64 = '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';

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
