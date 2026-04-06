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
  :root {
    color-scheme: light dark;
    --pp-bg: light-dark(#f0f1f3, #16171a);
    --pp-surface-1: light-dark(#ffffff, #1e2228);
    --pp-surface-2: light-dark(#e8e9ec, #232830);
    --pp-text: light-dark(#16171a, #fafdff);
    --pp-text-muted: light-dark(#6b7685, #5bc0de);
    --pp-border: light-dark(#d0d7de, #2a3540);
    --pp-border-bold: light-dark(#b8c0c8, #3d4f5c);
    --pp-accent: light-dark(#0b8a4b, #10d275);
    --pp-accent-hover: light-dark(#076835, #2dd882);
    --pp-accent-soft: light-dark(#e6f7ed, #0a2015);
    --pp-error: light-dark(#d62411, #f44336);
    --pp-error-bg: light-dark(#fde8e6, #300a0a);
    --pp-success: light-dark(#0a8f52, #3bdf8c);
    --pp-success-bg: light-dark(#e6f9ee, #0d2818);
    --pp-warning: light-dark(#d4620a, #ff8426);
    --pp-warning-bg: light-dark(#fff3e6, #2a1a00);
    --pp-shadow-sm: 0 1px 2px light-dark(rgba(0,0,0,.05), rgba(0,0,0,.2));
    --pp-shadow-md: 0 4px 12px light-dark(rgba(0,0,0,.08), rgba(0,0,0,.3));
    --pp-radius: 8px; --pp-radius-lg: 12px;
    --pp-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --pp-font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--pp-font); background: var(--pp-bg); color: var(--pp-text); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  :focus-visible { outline: 2px solid var(--pp-accent); outline-offset: 2px; border-radius: 4px; }`;

// Synchronous inline script to prevent flash of wrong theme — must be injected before <style> tags
export const THEME_FLASH_SCRIPT = `<script>(function(){var t=localStorage.getItem('pp-theme');if(t==='dark'||t==='light')document.documentElement.style.colorScheme=t;})()</script>`;

// Build reusable header bar HTML
export function buildHeaderHTML({ displayName, userId, apiOrigin, showDashboardLink = true, canPublish = false, isPrivate = false }) {
  const userName = displayName ? escHtml(displayName) : (userId ? escHtml(userId) : '');
  const dashboardLink = showDashboardLink ? `
    <a class="pp-header-btn" href="${escHtml(apiOrigin || '')}/dashboard" title="Dashboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span class="pp-menu-label">Dashboard</span>
    </a>` : '';

  return `
  <div id="pp-header-inner">
    <div id="pp-header-left">
      <a id="pp-header-logo" href="${escHtml(apiOrigin || '')}/dashboard">
        <img src="/assets/logo.png" alt="PlanPush" width="22" height="22" style="flex-shrink:0">
        PlanPush
      </a>
      ${isPrivate ? `<span id="pp-private-badge" style="display:none"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Private</span>` : ''}
    </div>
    <div id="pp-header-right">
      <button id="pp-comments-btn" class="pp-header-btn pp-header-btn-accent" title="Comments" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span id="pp-comments-btn-label">Comments</span>
        <span id="pp-comments-btn-badge" style="display:none">0</span>
      </button>
      ${canPublish ? `<button id="pp-publish-btn" class="pp-header-btn" title="Publish plan" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        <span id="pp-publish-btn-label">Publish</span>
      </button>` : ''}
      <div id="pp-header-actions">
        <button id="pp-share-btn" class="pp-header-btn" title="Copy link" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span class="pp-menu-label">Share</span>
        </button>
        <button id="pp-info-btn" class="pp-header-btn" title="Plan info" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span class="pp-menu-label">Plan Info</span>
        </button>
        <button id="pp-theme-btn" class="pp-header-btn" title="Toggle theme" aria-label="Toggle theme">
          <svg id="pp-theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg id="pp-theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <span id="pp-header-user">${userName}</span>
        ${dashboardLink}
        <button id="pp-logout-btn" class="pp-header-btn" title="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span class="pp-menu-label">Sign Out</span>
        </button>
      </div>
      <button id="pp-menu-toggle" class="pp-header-btn pp-menu-toggle" title="Menu" aria-label="Menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>`;
}

// Shared header CSS (used by both dashboard and overlay)
export const HEADER_CSS = `
#pp-header{position:fixed;top:0;left:0;right:0;height:48px;background:var(--pp-bg,#f0f1f3);border-bottom:1px solid var(--pp-border,#d0d7de);z-index:100001;padding:0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:var(--pp-text,#16171a);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:color-mix(in srgb, var(--pp-bg,#f0f1f3) 85%, transparent);box-shadow:0 1px 0 light-dark(transparent, rgba(255,255,255,.04))}
#pp-header-inner{max-width:1100px;margin:0 auto;height:100%;display:flex;align-items:center;justify-content:space-between;padding:0 16px}
#pp-header-left{display:flex;align-items:center;gap:10px}
#pp-header-logo{display:flex;align-items:center;gap:7px;font-weight:700;font-size:14px;color:var(--pp-text,#16171a);text-decoration:none;letter-spacing:-0.01em;transition:opacity .15s}
#pp-header-logo:hover{opacity:.7}
#pp-private-badge{display:inline-flex;align-items:center;gap:4px;background:light-dark(#f3e8ff,#2e1065);color:light-dark(#7c3aed,#c4b5fd);font-size:11px;font-weight:600;padding:2px 8px 2px 6px;border-radius:20px;margin-left:8px;white-space:nowrap}
#pp-header-right{display:flex;align-items:center;gap:4px}
#pp-header-user{font-size:12px;color:var(--pp-text-muted,#6b7685);padding:0 8px}
.pp-header-btn{display:flex;align-items:center;justify-content:center;gap:4px;background:none;border:none;cursor:pointer;color:var(--pp-text-muted,#6b7685);font-size:12px;font-family:inherit;padding:0;width:36px;height:36px;border-radius:8px;text-decoration:none;transition:background .15s,color .15s}
.pp-header-btn:hover{background:var(--pp-surface-1,#ffffff);color:var(--pp-text,#16171a)}
.pp-header-btn:active{transform:scale(.95)}
.pp-header-btn svg{width:16px;height:16px;flex-shrink:0}
.pp-header-btn-accent{width:auto;padding:0 12px;gap:6px;background:var(--pp-accent,#0b8a4b);color:#fff;font-weight:600;font-size:12px}
.pp-header-btn-accent:hover{background:var(--pp-accent-hover,#076835);color:#fff}
.pp-header-btn-accent svg{stroke:#fff}
.pp-header-btn-accent.pp-active{background:var(--pp-bg,#f0f1f3);color:var(--pp-accent,#0b8a4b);box-shadow:inset 0 0 0 1.5px var(--pp-accent,#0b8a4b)}
.pp-header-btn-accent.pp-active:hover{background:var(--pp-accent-soft,#e6f7ed)}
.pp-header-btn-accent.pp-active svg{stroke:var(--pp-accent,#0b8a4b)}
#pp-publish-btn{width:auto;padding:0 12px;gap:6px;background:var(--pp-surface-1,#ffffff);color:var(--pp-text,#16171a);font-weight:600;font-size:12px;border:1px solid var(--pp-border,#d0d7de)}
#pp-publish-btn:hover{background:var(--pp-accent,#0b8a4b);color:#fff;border-color:var(--pp-accent,#0b8a4b)}
#pp-publish-btn:hover svg{stroke:#fff}
#pp-publish-btn-label{display:inline}
#pp-comments-btn-badge{display:none}
.pp-menu-label{display:none}
#pp-header-actions{display:flex;align-items:center;gap:4px}
#pp-theme-btn{position:relative;overflow:hidden}
#pp-theme-btn svg{position:absolute;transition:opacity .2s,transform .2s}
#pp-theme-btn .pp-hidden{opacity:0;transform:scale(.5)}
.pp-menu-toggle{display:none}
@media(max-width:600px){
#pp-header-inner{padding:0 8px}
#pp-comments-btn-label{display:none}
#pp-publish-btn-label{display:none}
#pp-publish-btn{padding:0;width:36px;border:none}
#pp-comments-btn-badge{display:inline-block;background:var(--pp-bg,#f0f1f3);color:var(--pp-accent,#0b8a4b);font-size:11px;font-weight:700;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;padding:0 4px}
.pp-header-btn-accent{width:auto;padding:0 8px;gap:5px}
.pp-menu-toggle{display:flex;width:40px;height:40px}
#pp-header-actions{display:none;position:absolute;top:48px;right:0;flex-direction:column;align-items:stretch;background:var(--pp-bg,#f0f1f3);border:1px solid var(--pp-border,#d0d7de);border-top:none;border-radius:0 0 12px 12px;box-shadow:0 8px 24px light-dark(rgba(0,0,0,.12),rgba(0,0,0,.4));padding:6px;min-width:180px;z-index:100002}
#pp-header-actions.pp-menu-open{display:flex}
#pp-header-actions .pp-header-btn{width:100%;height:40px;justify-content:flex-start;padding:0 12px;gap:10px;border-radius:8px;font-size:13px}
#pp-header-actions .pp-header-btn svg{width:16px;height:16px}
#pp-header-actions .pp-menu-label{display:inline}
#pp-header-actions #pp-header-user{display:block;padding:8px 12px;font-size:13px;color:var(--pp-text,#16171a);font-weight:600;border-bottom:1px solid var(--pp-border,#d0d7de);margin-bottom:2px}
}`;

// Header interaction JS — logout + mobile menu toggle
export const LOGOUT_JS = `
(function() {
  var btn = document.getElementById('pp-logout-btn');
  if (btn) btn.addEventListener('click', function() {
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(function() { window.location.href = '/auth/login'; });
  });
  var menuToggle = document.getElementById('pp-menu-toggle');
  var actions = document.getElementById('pp-header-actions');
  if (menuToggle && actions) {
    menuToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      actions.classList.toggle('pp-menu-open');
    });
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#pp-header-actions') && !e.target.closest('#pp-menu-toggle')) {
        actions.classList.remove('pp-menu-open');
      }
    });
  }
  // Theme toggle
  var themeBtn = document.getElementById('pp-theme-btn');
  if (themeBtn) {
    var sun = document.getElementById('pp-theme-sun');
    var moon = document.getElementById('pp-theme-moon');
    function applyThemeIcon() {
      var cs = document.documentElement.style.colorScheme;
      var isDark = cs === 'dark' || (!cs && window.matchMedia('(prefers-color-scheme:dark)').matches);
      sun.style.display = isDark ? 'none' : '';
      moon.style.display = isDark ? '' : 'none';
      sun.classList.toggle('pp-hidden', isDark);
      moon.classList.toggle('pp-hidden', !isDark);
    }
    applyThemeIcon();
    themeBtn.addEventListener('click', function() {
      var cs = document.documentElement.style.colorScheme;
      var isDark = cs === 'dark' || (!cs && window.matchMedia('(prefers-color-scheme:dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.style.colorScheme = next;
      localStorage.setItem('pp-theme', next);
      applyThemeIcon();
    });
    window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', applyThemeIcon);
  }
})();`;
