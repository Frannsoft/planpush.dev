// Comment overlay — generates inline HTML/CSS/JS for injection into plan pages
// Static parts are pre-computed at module load; only nonce + data attributes vary per request.

import { buildHeaderHTML, HEADER_CSS, LOGOUT_JS, escHtml } from './html.js';

// --- Pre-computed static parts ---

const SIDEBAR_CSS = `
#pp-toggle{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:100000;background:var(--pp-accent,#0969da);color:#fff;border:none;border-radius:8px 0 0 8px;padding:12px 6px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:600;writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.5px;box-shadow:-2px 0 8px rgba(0,0,0,.15);transition:right .25s ease}
#pp-toggle:hover{background:var(--pp-accent-hover,#0550ae)}
#pp-toggle .pp-badge{display:inline-block;background:#fff;color:var(--pp-accent,#0969da);border-radius:10px;padding:1px 6px;font-size:11px;font-weight:700;margin-top:6px;writing-mode:horizontal-tb}
#pp-toggle.pp-shifted{right:360px}
@media(max-width:600px){#pp-toggle.pp-shifted{right:100vw}}

#pp-sidebar{position:fixed;right:0;top:44px;height:calc(100vh - 44px);width:360px;max-width:100vw;background:var(--pp-bg,#fff);border-left:1px solid var(--pp-border,#d0d7de);z-index:99999;transform:translateX(100%);transition:transform .25s ease;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:var(--pp-text,#1a1d23);box-shadow:-4px 0 20px rgba(0,0,0,.1)}
#pp-sidebar.pp-open{transform:translateX(0)}
@media(prefers-color-scheme:dark){#pp-sidebar{box-shadow:-4px 0 20px rgba(0,0,0,.4)}}
@media(max-width:600px){#pp-sidebar{width:100vw}}

#pp-sidebar-header{padding:16px;border-bottom:1px solid var(--pp-border,#d0d7de);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
#pp-sidebar-header h3{font-size:15px;font-weight:600;margin:0}
#pp-sidebar-close{background:none;border:none;cursor:pointer;color:var(--pp-text-muted,#57606a);font-size:20px;padding:4px 8px;border-radius:4px}
#pp-sidebar-close:hover{background:var(--pp-surface-1,#f6f8fa)}

#pp-anchor-filter{padding:8px 16px;background:var(--pp-surface-1,#f6f8fa);border-bottom:1px solid var(--pp-border,#d0d7de);font-size:12px;color:var(--pp-text-muted,#57606a);display:none;align-items:center;gap:6px;flex-shrink:0}
#pp-anchor-filter.pp-visible{display:flex}
#pp-anchor-filter code{background:var(--pp-accent-soft,#ddf4ff);color:var(--pp-accent,#0969da);padding:2px 6px;border-radius:4px;font-size:11px}
#pp-anchor-filter button{background:none;border:none;cursor:pointer;color:var(--pp-text-muted,#57606a);font-size:11px;text-decoration:underline;margin-left:auto}

#pp-comments-list{flex:1;overflow-y:auto;padding:8px 0}
.pp-comment{padding:12px 16px;border-bottom:1px solid var(--pp-border,#d0d7de)}
.pp-comment.pp-resolved{opacity:.5}
.pp-comment-meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--pp-text-muted,#57606a);margin-bottom:4px}
.pp-comment-author{font-weight:600;color:var(--pp-text,#1a1d23)}
.pp-comment-anchor{background:var(--pp-accent-soft,#ddf4ff);color:var(--pp-accent,#0969da);padding:1px 5px;border-radius:3px;font-size:10px;cursor:pointer}
.pp-comment-anchor:hover{text-decoration:underline}
.pp-comment-body{font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.pp-comment-actions{margin-top:6px}
.pp-resolve-btn{background:none;border:1px solid var(--pp-border,#d0d7de);border-radius:4px;padding:3px 8px;font-size:11px;color:var(--pp-text-muted,#57606a);cursor:pointer}
.pp-resolve-btn:hover{background:var(--pp-surface-1,#f6f8fa);color:var(--pp-text,#1a1d23)}
.pp-resolved-tag{font-size:11px;color:var(--pp-success,#1a7f37);font-style:italic}
.pp-outdated-tag{display:inline-block;background:var(--pp-surface-1,#f6f8fa);color:var(--pp-text-muted,#57606a);border:1px solid var(--pp-border,#d0d7de);border-radius:3px;font-size:10px;padding:1px 5px;margin-left:4px}
.pp-comment.pp-outdated{opacity:.65}
#pp-hide-outdated-wrap{padding:4px 16px 8px;font-size:12px;color:var(--pp-text-muted,#57606a);display:flex;align-items:center;gap:5px;cursor:pointer;flex-shrink:0}
#pp-hide-outdated-wrap input{margin:0;cursor:pointer}
.pp-empty{padding:32px 16px;text-align:center;color:var(--pp-text-muted,#57606a);font-size:13px}

#pp-compose{padding:12px 16px;border-top:1px solid var(--pp-border,#d0d7de);flex-shrink:0}
#pp-compose textarea{width:100%;border:1px solid var(--pp-border,#d0d7de);border-radius:6px;padding:8px 10px;font-family:inherit;font-size:13px;resize:vertical;background:var(--pp-bg,#fff);color:var(--pp-text,#1a1d23);min-height:60px;box-sizing:border-box}
#pp-compose textarea:focus{outline:none;border-color:var(--pp-accent,#0969da);box-shadow:0 0 0 2px var(--pp-accent-soft,#ddf4ff)}
#pp-compose-actions{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
#pp-compose button[type=submit]{background:var(--pp-accent,#0969da);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer}
#pp-compose button[type=submit]:hover{opacity:.9}
#pp-compose button[type=submit]:disabled{opacity:.5;cursor:not-allowed}
#pp-compose-anchor{font-size:11px;color:var(--pp-text-muted,#57606a)}

[data-anchor].pp-anchor-highlight{outline:2px solid var(--pp-accent,#0969da);outline-offset:2px;border-radius:4px;transition:outline-color .15s}
[data-anchor]{cursor:pointer;position:relative}
[data-anchor]:hover{outline:1px dashed var(--pp-accent,#0969da);outline-offset:2px;border-radius:4px}
[data-anchor]:hover::after{content:'Click to comment';position:absolute;top:-28px;right:8px;background:var(--pp-text,#1a1d23);color:var(--pp-bg,#fff);font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:4px 10px;border-radius:4px;white-space:nowrap;z-index:99998;pointer-events:none;opacity:.9;box-shadow:0 2px 6px rgba(0,0,0,.2)}
[data-anchor].pp-has-comments:hover::after{content:attr(data-pp-comment-count) ' comments — click to view'}
[data-anchor].pp-has-comments{outline:3px solid var(--pp-accent,#0969da);outline-offset:4px;border-radius:6px}
[data-anchor].pp-has-comments.pp-anchor-highlight{outline-width:4px}
.pp-bubble{position:absolute;top:-14px;right:-14px;background:var(--pp-accent,#0969da);color:#fff;border-radius:20px;padding:6px 14px;font-size:14px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.25);line-height:1.4;display:flex;align-items:center;gap:6px;white-space:nowrap;transition:transform .15s,box-shadow .15s}
.pp-bubble:hover{transform:scale(1.12);box-shadow:0 4px 14px rgba(0,0,0,.3)}
.pp-bubble svg{width:18px;height:18px;flex-shrink:0}`;

const SIDEBAR_HTML = `
<button id="pp-toggle" title="Comments">Comments<span class="pp-badge" id="pp-badge" style="display:none">0</span></button>

<div id="pp-sidebar">
  <div id="pp-sidebar-header">
    <h3>Comments</h3>
    <button id="pp-sidebar-close" title="Close">&times;</button>
  </div>
  <label id="pp-hide-outdated-wrap"><input type="checkbox" id="pp-hide-outdated"> Hide outdated</label>
  <div id="pp-anchor-filter">
    <span>Filtered:</span> <code id="pp-anchor-name"></code>
    <button id="pp-anchor-clear">Show all</button>
  </div>
  <div id="pp-comments-list"></div>
  <div id="pp-compose">
    <form id="pp-compose-form">
      <textarea id="pp-compose-input" placeholder="Leave a comment..." rows="3"></textarea>
      <div id="pp-compose-actions">
        <span id="pp-compose-anchor"></span>
        <button type="submit">Comment</button>
      </div>
    </form>
  </div>
</div>`;

const OVERLAY_JS = `(function() {
  var cfg = document.getElementById('pp-overlay-script').dataset;
  var SESSION_ID = cfg.ppSession;
  var CURRENT_USER = cfg.ppUser;
  var CURRENT_DISPLAY_NAME = cfg.ppDisplayName || '';
  var API = cfg.ppOrigin;
  var CURRENT_VERSION = parseInt(cfg.ppVersion, 10) || 1;

  var state = {
    comments: [],
    activeAnchor: null,
    hideOutdated: localStorage.getItem('pp-hide-outdated') === '1',
    polling: null,
    open: false,
    submitting: false,
  };

  var toggle = document.getElementById('pp-toggle');
  var badge = document.getElementById('pp-badge');
  var sidebar = document.getElementById('pp-sidebar');
  var closeBtn = document.getElementById('pp-sidebar-close');
  var filterBar = document.getElementById('pp-anchor-filter');
  var anchorName = document.getElementById('pp-anchor-name');
  var clearFilter = document.getElementById('pp-anchor-clear');
  var commentsList = document.getElementById('pp-comments-list');
  var composeForm = document.getElementById('pp-compose-form');
  var composeInput = document.getElementById('pp-compose-input');
  var composeAnchor = document.getElementById('pp-compose-anchor');
  var hideOutdatedCb = document.getElementById('pp-hide-outdated');

  hideOutdatedCb.checked = state.hideOutdated;
  hideOutdatedCb.addEventListener('change', function() {
    state.hideOutdated = hideOutdatedCb.checked;
    localStorage.setItem('pp-hide-outdated', state.hideOutdated ? '1' : '0');
    render();
  });

  toggle.addEventListener('click', function() {
    if (state.open) closeSidebar(); else openSidebar();
  });
  closeBtn.addEventListener('click', closeSidebar);

  function openSidebar() {
    state.open = true;
    sidebar.classList.add('pp-open');
    toggle.classList.add('pp-shifted');
    if (!state.polling) startPolling();
  }
  function closeSidebar() {
    state.open = false;
    sidebar.classList.remove('pp-open');
    toggle.classList.remove('pp-shifted');
  }

  function startPolling() {
    fetchComments();
    if (!state.polling) state.polling = setInterval(fetchComments, 10000);
  }
  function stopPolling() {
    if (state.polling) { clearInterval(state.polling); state.polling = null; }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) stopPolling();
    else if (state.open) startPolling();
  });

  async function fetchComments() {
    try {
      var resp = await fetch(API + '/api/comments?session_id=' + SESSION_ID, {
        credentials: 'include'
      });
      if (resp.status === 401) {
        window.location.href = '/auth/login?redirect_to=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (!resp.ok) return;
      var data = await resp.json();
      state.comments = data.comments || [];
      if (typeof data.current_version === 'number') CURRENT_VERSION = data.current_version;
      updateBadge();
      render();
    } catch(e) {}
  }

  async function postComment(content, anchor) {
    if (state.submitting) return;
    state.submitting = true;
    try {
      var resp = await fetch(API + '/api/comments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: SESSION_ID, content: content, anchor: anchor || null }),
      });
      if (resp.ok) {
        var c = await resp.json();
        c.author_github_id = CURRENT_USER;
        if (!c.author_display_name) c.author_display_name = CURRENT_DISPLAY_NAME;
        if (!c.plan_version) c.plan_version = CURRENT_VERSION;
        state.comments.push(c);
        updateBadge();
        render();
        composeInput.value = '';
      }
    } catch(e) {} finally { state.submitting = false; }
  }

  async function resolveComment(commentId) {
    try {
      var resp = await fetch(API + '/api/comments/' + commentId + '/resolve', {
        method: 'PATCH',
        credentials: 'include',
      });
      if (resp.ok) {
        for (var i = 0; i < state.comments.length; i++) {
          if (state.comments[i].id === commentId) {
            state.comments[i].resolved = 1;
            break;
          }
        }
        render();
      }
    } catch(e) {}
  }

  function updateAnchorBubbles() {
    document.querySelectorAll('.pp-bubble').forEach(function(b) { b.remove(); });
    document.querySelectorAll('.pp-has-comments').forEach(function(el) { el.classList.remove('pp-has-comments'); el.removeAttribute('data-pp-comment-count'); });
    var counts = {};
    for (var i = 0; i < state.comments.length; i++) {
      var c = state.comments[i];
      if (c.anchor && !c.resolved) counts[c.anchor] = (counts[c.anchor] || 0) + 1;
    }
    for (var anchor in counts) {
      var el = document.querySelector('[data-anchor="' + CSS.escape(anchor) + '"]');
      if (!el) continue;
      var pos = getComputedStyle(el).position;
      if (pos === 'static') el.style.position = 'relative';
      el.classList.add('pp-has-comments');
      el.setAttribute('data-pp-comment-count', counts[anchor]);
      var bubble = document.createElement('div');
      bubble.className = 'pp-bubble';
      bubble.setAttribute('data-pp-bubble-anchor', anchor);
      bubble.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M8 1C4.13 1 1 3.69 1 7c0 1.8.93 3.4 2.4 4.47L3 14l2.82-1.47C6.5 12.83 7.23 13 8 13c3.87 0 7-2.69 7-6S11.87 1 8 1z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>' + counts[anchor];
      el.appendChild(bubble);
    }
  }

  document.addEventListener('click', function(e) {
    var bubble = e.target.closest('.pp-bubble');
    if (!bubble) return;
    e.stopPropagation();
    e.preventDefault();
    var anchorId = bubble.getAttribute('data-pp-bubble-anchor');
    if (anchorId) setAnchor(anchorId);
  });

  function updateBadge() {
    var unresolved = state.comments.filter(function(c) { return !c.resolved; }).length;
    if (unresolved > 0) { badge.textContent = unresolved; badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  }

  function isOutdated(c) { return c.plan_version < CURRENT_VERSION; }

  function render() {
    var filtered = state.comments;
    if (state.activeAnchor) {
      filtered = filtered.filter(function(c) { return c.anchor === state.activeAnchor; });
      filterBar.classList.add('pp-visible');
      anchorName.textContent = state.activeAnchor;
      composeAnchor.textContent = 'on ' + state.activeAnchor;
    } else {
      filterBar.classList.remove('pp-visible');
      composeAnchor.textContent = 'general comment';
    }
    var beforeOutdatedFilter = filtered.length;
    if (state.hideOutdated) {
      filtered = filtered.filter(function(c) { return !isOutdated(c); });
    }
    if (filtered.length === 0) {
      var hiddenByOutdated = beforeOutdatedFilter > 0 && filtered.length === 0;
      var emptyMsg = hiddenByOutdated ? 'All comments are outdated and hidden.' : (state.activeAnchor ? 'No comments on this element yet.' : 'No comments yet. Be the first!');
      commentsList.innerHTML = '<div class="pp-empty">' + emptyMsg + '</div>';
      updateAnchorBubbles();
      return;
    }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var c = filtered[i];
      var outdated = isOutdated(c);
      var resolvedClass = c.resolved ? ' pp-resolved' : '';
      var outdatedClass = outdated ? ' pp-outdated' : '';
      html += '<div class="pp-comment' + resolvedClass + outdatedClass + '" data-pp-comment-anchor="' + escH(c.anchor || '') + '" style="cursor:pointer">';
      html += '<div class="pp-comment-meta">';
      html += '<span class="pp-comment-author">@' + escH(c.author_display_name || c.author_github_id || 'unknown') + '</span>';
      html += '<span>' + timeAgo(c.created_at) + '</span>';
      if (outdated) html += '<span class="pp-outdated-tag">Outdated</span>';
      if (c.anchor && !state.activeAnchor) {
        html += ' <span class="pp-comment-anchor" data-pp-goto="' + escH(c.anchor) + '">' + escH(c.anchor) + '</span>';
      }
      html += '</div>';
      html += '<div class="pp-comment-body">' + escH(c.content) + '</div>';
      html += '<div class="pp-comment-actions">';
      if (c.resolved) {
        html += '<span class="pp-resolved-tag">Resolved</span>';
      } else if (c.author_github_id === CURRENT_USER) {
        html += '<button class="pp-resolve-btn" data-pp-resolve="' + c.id + '">Resolve</button>';
      }
      html += '</div></div>';
    }
    commentsList.innerHTML = html;
    updateAnchorBubbles();
  }

  commentsList.addEventListener('click', function(e) {
    var resolveBtn = e.target.closest('[data-pp-resolve]');
    if (resolveBtn) { resolveComment(resolveBtn.dataset.ppResolve); return; }
    var commentEl = e.target.closest('.pp-comment');
    if (commentEl) {
      var anchorAttr = commentEl.getAttribute('data-pp-comment-anchor');
      if (anchorAttr) {
        if (state.activeAnchor !== anchorAttr) { state.activeAnchor = anchorAttr; render(); }
        scrollToAnchor(anchorAttr);
      }
    }
  });

  clearFilter.addEventListener('click', function() {
    clearAnchorHighlight();
    state.activeAnchor = null;
    render();
    updateAnchorBubbles();
  });

  function setAnchor(anchorId) {
    state.activeAnchor = anchorId;
    if (!state.open) openSidebar();
    render();
    scrollToAnchor(anchorId);
  }

  function clearAnchorHighlight() {
    var prev = document.querySelector('.pp-anchor-highlight');
    if (prev) prev.classList.remove('pp-anchor-highlight');
  }

  function scrollToAnchor(anchorId) {
    setTimeout(function() {
      var targetEl = document.querySelector('[data-anchor="' + CSS.escape(anchorId) + '"]');
      if (!targetEl) return;
      var pane = targetEl.closest('.plan-pane');
      if (pane && !pane.classList.contains('active')) {
        var paneName = pane.getAttribute('data-pane');
        if (paneName) {
          var tab = document.querySelector('.plan-tab[data-tab="' + CSS.escape(paneName) + '"]');
          if (tab) tab.click();
        }
      }
      clearAnchorHighlight();
      targetEl.classList.add('pp-anchor-highlight');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  document.addEventListener('click', function(e) {
    var anchor = e.target.closest('[data-anchor]');
    if (!anchor) return;
    if (e.target.closest('#pp-sidebar') || e.target.closest('#pp-toggle')) return;
    e.preventDefault();
    setAnchor(anchor.getAttribute('data-anchor'));
  });

  composeForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var content = composeInput.value.trim();
    if (!content) return;
    postComment(content, state.activeAnchor);
  });

  composeInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var content = composeInput.value.trim();
      if (content) postComment(content, state.activeAnchor);
    }
  });

  function escH(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function timeAgo(iso) {
    if (!iso) return 'unknown';
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(diff)) return 'unknown';
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
  }

  startPolling();
})();`;

// --- Info panel static parts ---

const INFO_PANEL_CSS = `
#pp-info-panel{position:fixed;right:0;top:44px;height:calc(100vh - 44px);width:360px;max-width:100vw;background:var(--pp-bg,#fff);border-left:1px solid var(--pp-border,#d0d7de);z-index:99998;transform:translateX(100%);transition:transform .25s ease;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:var(--pp-text,#1a1d23);box-shadow:-4px 0 20px rgba(0,0,0,.1)}
#pp-info-panel.pp-open{transform:translateX(0)}
@media(prefers-color-scheme:dark){#pp-info-panel{box-shadow:-4px 0 20px rgba(0,0,0,.4)}}
@media(max-width:600px){#pp-info-panel{width:100vw}}

#pp-info-header{padding:12px 16px;border-bottom:1px solid var(--pp-border,#d0d7de);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
#pp-info-header h3{font-size:15px;font-weight:600;margin:0}
#pp-info-close{background:none;border:none;cursor:pointer;color:var(--pp-text-muted,#57606a);font-size:20px;padding:4px 8px;border-radius:4px}
#pp-info-close:hover{background:var(--pp-surface-1,#f6f8fa)}

#pp-info-tabs{display:flex;border-bottom:1px solid var(--pp-border,#d0d7de);flex-shrink:0}
.pp-info-tab{flex:1;padding:8px 0;text-align:center;font-size:12px;font-weight:600;color:var(--pp-text-muted,#57606a);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit}
.pp-info-tab:hover{color:var(--pp-text,#1a1d23);background:var(--pp-surface-1,#f6f8fa)}
.pp-info-tab.active{color:var(--pp-accent,#0969da);border-bottom-color:var(--pp-accent,#0969da)}

.pp-info-pane{flex:1;overflow-y:auto;padding:16px;display:none}
.pp-info-pane.active{display:block}

.pp-info-creator{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.pp-info-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0}
.pp-info-name{font-weight:600;font-size:14px}
.pp-info-username{font-size:12px;color:var(--pp-text-muted,#57606a)}

.pp-info-meta{font-size:12px;color:var(--pp-text-muted,#57606a);margin-bottom:6px}
.pp-info-meta strong{color:var(--pp-text,#1a1d23);font-weight:600}

.pp-info-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.pp-info-stat{background:var(--pp-surface-1,#f6f8fa);border:1px solid var(--pp-border,#d0d7de);border-radius:6px;padding:10px;text-align:center}
.pp-info-stat-value{font-size:18px;font-weight:700}
.pp-info-stat-label{font-size:10px;color:var(--pp-text-muted,#57606a);text-transform:uppercase;letter-spacing:.03em;margin-top:2px}

.pp-version-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--pp-border,#d0d7de)}
.pp-version-item:last-child{border-bottom:none}
.pp-version-num{width:28px;height:28px;border-radius:50%;background:var(--pp-accent-soft,#ddf4ff);color:var(--pp-accent,#0969da);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.pp-version-num.current{background:var(--pp-accent,#0969da);color:#fff}
.pp-version-info{flex:1;min-width:0}
.pp-version-info a{color:var(--pp-accent,#0969da);text-decoration:none;font-size:13px;font-weight:500}
.pp-version-info a:hover{text-decoration:underline}
.pp-version-info span{display:block;font-size:11px;color:var(--pp-text-muted,#57606a)}
.pp-version-current{font-size:10px;background:var(--pp-accent-soft,#ddf4ff);color:var(--pp-accent,#0969da);padding:2px 6px;border-radius:3px;font-weight:600;flex-shrink:0}

.pp-activity-item{padding:10px 0;border-bottom:1px solid var(--pp-border,#d0d7de);font-size:13px}
.pp-activity-item:last-child{border-bottom:none}
.pp-activity-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--pp-text-muted,#57606a);margin-bottom:3px}
.pp-activity-meta img{width:16px;height:16px;border-radius:50%}
.pp-activity-meta strong{color:var(--pp-text,#1a1d23);font-weight:600}
.pp-activity-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600}
.pp-activity-badge.push{background:var(--pp-accent-soft,#ddf4ff);color:var(--pp-accent,#0969da)}
.pp-activity-badge.comment{background:#fff8c5;color:#9a6700}
.pp-activity-badge.resolve{background:var(--pp-success-bg,#dafbe1);color:var(--pp-success,#1a7f37)}
.pp-activity-content{font-size:12px;color:var(--pp-text-muted,#57606a);margin-top:2px;white-space:pre-wrap;word-break:break-word}

#pp-version-banner{display:none;position:fixed;top:44px;left:0;right:0;z-index:99997;background:#fff8c5;color:#9a6700;border-bottom:1px solid #e3d89c;padding:8px 16px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center}
@media(prefers-color-scheme:dark){#pp-version-banner{background:#2d2a1e;color:#d4a72c;border-bottom-color:#4a4329}}
#pp-version-banner a{color:inherit;font-weight:600;text-decoration:underline}
#pp-version-banner.pp-visible{display:block}

#pp-share-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--pp-text,#1a1d23);color:var(--pp-bg,#fff);padding:8px 16px;border-radius:6px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;z-index:100002}
#pp-share-toast.pp-visible{opacity:1;transform:translateX(-50%) translateY(0)}

.pp-info-loading{text-align:center;padding:32px 16px;color:var(--pp-text-muted,#57606a);font-size:13px}`;

const INFO_PANEL_HTML = `
<div id="pp-version-banner"><span id="pp-version-banner-text"></span></div>
<div id="pp-share-toast">Link copied!</div>

<div id="pp-info-panel">
  <div id="pp-info-header">
    <h3>Plan Info</h3>
    <button id="pp-info-close" title="Close">&times;</button>
  </div>
  <div id="pp-info-tabs">
    <button class="pp-info-tab active" data-info-tab="info">Info</button>
    <button class="pp-info-tab" data-info-tab="history">History</button>
    <button class="pp-info-tab" data-info-tab="activity">Activity</button>
  </div>
  <div class="pp-info-pane active" data-info-pane="info" id="pp-info-pane-info">
    <div class="pp-info-loading">Loading...</div>
  </div>
  <div class="pp-info-pane" data-info-pane="history" id="pp-info-pane-history">
    <div class="pp-info-loading">Loading...</div>
  </div>
  <div class="pp-info-pane" data-info-pane="activity" id="pp-info-pane-activity">
    <div class="pp-info-loading">Loading...</div>
  </div>
</div>`;

const INFO_PANEL_JS = `(function() {
  var cfg = document.getElementById('pp-info-script').dataset;
  var SESSION_ID = cfg.ppSession;
  var API = cfg.ppOrigin;
  var VIEWING_VERSION = cfg.ppViewingVersion ? parseInt(cfg.ppViewingVersion, 10) : 0;
  var CURRENT_VERSION = parseInt(cfg.ppCurrentVersion, 10) || 1;

  var infoBtn = document.getElementById('pp-info-btn');
  var shareBtn = document.getElementById('pp-share-btn');
  var panel = document.getElementById('pp-info-panel');
  var closeBtn = document.getElementById('pp-info-close');
  var tabs = document.querySelectorAll('.pp-info-tab');
  var panes = document.querySelectorAll('.pp-info-pane');
  var banner = document.getElementById('pp-version-banner');
  var bannerText = document.getElementById('pp-version-banner-text');
  var toast = document.getElementById('pp-share-toast');

  var panelOpen = false;
  var dataLoaded = false;
  var infoData = null;

  // Show header buttons on plan pages
  if (infoBtn) infoBtn.style.display = '';
  if (shareBtn) shareBtn.style.display = '';

  // Version banner for old versions
  if (VIEWING_VERSION > 0 && VIEWING_VERSION < CURRENT_VERSION) {
    bannerText.innerHTML = 'Viewing version ' + VIEWING_VERSION + ' of ' + CURRENT_VERSION + ' — <a href="/p/' + escH(SESSION_ID) + '">View latest</a>';
    banner.classList.add('pp-visible');
    document.body.style.paddingTop = '80px';
  }

  // Share button
  if (shareBtn) shareBtn.addEventListener('click', function() {
    var url = window.location.origin + '/p/' + encodeURIComponent(SESSION_ID);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(showToast).catch(showToast);
    } else {
      showToast();
    }
  });

  function showToast() {
    toast.classList.add('pp-visible');
    setTimeout(function() { toast.classList.remove('pp-visible'); }, 2000);
  }

  // Info panel toggle
  if (infoBtn) infoBtn.addEventListener('click', function() {
    if (panelOpen) closePanel(); else openPanel();
  });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  function openPanel() {
    panelOpen = true;
    panel.classList.add('pp-open');
    if (!dataLoaded) loadData();
  }
  function closePanel() {
    panelOpen = false;
    panel.classList.remove('pp-open');
  }

  // Tab switching
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function() {
      var target = this.getAttribute('data-info-tab');
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].classList.toggle('active', tabs[j].getAttribute('data-info-tab') === target);
      }
      for (var j = 0; j < panes.length; j++) {
        panes[j].classList.toggle('active', panes[j].getAttribute('data-info-pane') === target);
      }
    });
  }

  async function loadData() {
    try {
      var resp = await fetch(API + '/api/sessions/' + SESSION_ID + '/info', { credentials: 'include' });
      if (!resp.ok) {
        renderError();
        return;
      }
      infoData = await resp.json();
      dataLoaded = true;
      renderInfo();
      renderHistory();
      renderActivity();
    } catch(e) {
      renderError();
    }
  }

  function renderError() {
    var msg = '<div class="pp-info-loading">Failed to load info.</div>';
    document.getElementById('pp-info-pane-info').innerHTML = msg;
    document.getElementById('pp-info-pane-history').innerHTML = msg;
    document.getElementById('pp-info-pane-activity').innerHTML = msg;
  }

  function renderInfo() {
    var s = infoData.session;
    var c = s.creator;
    var stats = infoData.comment_stats;
    var html = '';

    // Creator
    html += '<div class="pp-info-creator">';
    if (c.avatar_url) html += '<img class="pp-info-avatar" src="' + escH(c.avatar_url) + '" alt="">';
    html += '<div><div class="pp-info-name">' + escH(c.display_name || c.github_username || 'Unknown') + '</div>';
    if (c.github_username) html += '<div class="pp-info-username">@' + escH(c.github_username) + '</div>';
    html += '</div></div>';

    // Metadata
    html += '<div class="pp-info-meta"><strong>Title:</strong> ' + escH(s.title || 'Untitled Plan') + '</div>';
    html += '<div class="pp-info-meta"><strong>Created:</strong> ' + formatDate(s.created_at) + '</div>';
    html += '<div class="pp-info-meta"><strong>Last updated:</strong> ' + timeAgo(s.last_updated) + '</div>';
    html += '<div class="pp-info-meta"><strong>Version:</strong> ' + s.current_version + '</div>';

    // Stats
    html += '<div class="pp-info-stats">';
    html += '<div class="pp-info-stat"><div class="pp-info-stat-value">' + stats.total + '</div><div class="pp-info-stat-label">Comments</div></div>';
    html += '<div class="pp-info-stat"><div class="pp-info-stat-value">' + stats.open + '</div><div class="pp-info-stat-label">Open</div></div>';
    html += '<div class="pp-info-stat"><div class="pp-info-stat-value">' + stats.resolved + '</div><div class="pp-info-stat-label">Resolved</div></div>';
    html += '</div>';

    document.getElementById('pp-info-pane-info').innerHTML = html;
  }

  function renderHistory() {
    var versions = infoData.versions;
    if (!versions || versions.length === 0) {
      document.getElementById('pp-info-pane-history').innerHTML = '<div class="pp-info-loading">No version history available.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < versions.length; i++) {
      var v = versions[i];
      var isCurrent = v.version === CURRENT_VERSION;
      var isViewing = VIEWING_VERSION > 0 && v.version === VIEWING_VERSION;
      html += '<div class="pp-version-item">';
      html += '<div class="pp-version-num' + (isCurrent ? ' current' : '') + '">' + v.version + '</div>';
      html += '<div class="pp-version-info">';
      if (isCurrent) {
        html += '<a href="/p/' + SESSION_ID + '">Version ' + v.version + ' (latest)</a>';
      } else {
        html += '<a href="/p/' + SESSION_ID + '?v=' + v.version + '">Version ' + v.version + '</a>';
      }
      html += '<span>' + escH(v.pushed_by_name || v.pushed_by_username || 'Unknown') + ' · ' + timeAgo(v.pushed_at) + '</span>';
      html += '</div>';
      if (isViewing) html += '<span class="pp-version-current">Viewing</span>';
      else if (isCurrent) html += '<span class="pp-version-current">Latest</span>';
      html += '</div>';
    }
    document.getElementById('pp-info-pane-history').innerHTML = html;
  }

  function renderActivity() {
    var items = infoData.activity;
    if (!items || items.length === 0) {
      document.getElementById('pp-info-pane-activity').innerHTML = '<div class="pp-info-loading">No activity yet.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<div class="pp-activity-item">';
      html += '<div class="pp-activity-meta">';
      if (item.avatar) html += '<img src="' + escH(item.avatar) + '" alt="">';
      html += '<strong>' + escH(item.author) + '</strong>';
      html += '<span>' + timeAgo(item.timestamp) + '</span>';
      var badgeLabel = item.type === 'push' ? 'Push v' + (item.version || '?') : (item.type === 'resolve' ? 'Resolved' : 'Comment');
      html += '<span class="pp-activity-badge ' + item.type + '">' + badgeLabel + '</span>';
      html += '</div>';
      if (item.content) html += '<div class="pp-activity-content">' + escH(item.content) + '</div>';
      if (item.anchor) html += '<div class="pp-activity-content" style="font-size:11px;margin-top:2px">on <code>' + escH(item.anchor) + '</code></div>';
      html += '</div>';
    }
    document.getElementById('pp-info-pane-activity').innerHTML = html;
  }

  function escH(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function timeAgo(iso) {
    if (!iso) return 'unknown';
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(diff)) return 'unknown';
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
  }

  function formatDate(iso) {
    if (!iso) return 'unknown';
    try {
      return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    } catch(e) { return iso; }
  }
})();`;

// Pre-compute the static header parts (HEADER_CSS + body padding + LOGOUT_JS + sidebar CSS + sidebar HTML)
// Only the nonce and header content (which has per-user display name) are dynamic.
const STATIC_HEADER_STYLE = `<style>${HEADER_CSS}</style>\n<style>body{padding-top:44px !important}</style>`;
const STATIC_SIDEBAR_STYLE = `<style>${SIDEBAR_CSS}</style>`;
const STATIC_INFO_STYLE = `<style>${INFO_PANEL_CSS}</style>`;
const STATIC_SIDEBAR_HTML_AND_JS_PREFIX = SIDEBAR_HTML + `\n<script nonce="`;
const STATIC_JS_SUFFIX = `>${OVERLAY_JS}\n</script>`;

// --- Public API ---

export function buildOverlayHTML({ sessionId, currentUserId, displayName, apiOrigin, currentVersion, viewingVersion, nonce }) {
  const headerContent = buildHeaderHTML({ displayName, userId: currentUserId, apiOrigin, showDashboardLink: true });

  // Header bar (per-request: nonce + user-specific header content)
  const headerBar = STATIC_HEADER_STYLE
    + `\n<div id="pp-header">\n  ${headerContent}\n</div>`
    + `\n<script nonce="${escHtml(nonce)}">${LOGOUT_JS}</script>`;

  // Comment sidebar (per-request: nonce + data attributes on script tag)
  const sidebar = STATIC_SIDEBAR_STYLE
    + STATIC_SIDEBAR_HTML_AND_JS_PREFIX
    + escHtml(nonce)
    + `" id="pp-overlay-script"`
    + ` data-pp-session="${escHtml(sessionId)}"`
    + ` data-pp-user="${escHtml(currentUserId || '')}"`
    + ` data-pp-display-name="${escHtml(displayName || '')}"`
    + ` data-pp-origin="${escHtml(apiOrigin)}"`
    + ` data-pp-version="${escHtml(String(currentVersion || 1))}"`
    + STATIC_JS_SUFFIX;

  // Info panel (per-request: nonce + data attributes)
  const infoPanel = STATIC_INFO_STYLE
    + INFO_PANEL_HTML
    + `\n<script nonce="${escHtml(nonce)}" id="pp-info-script"`
    + ` data-pp-session="${escHtml(sessionId)}"`
    + ` data-pp-origin="${escHtml(apiOrigin)}"`
    + ` data-pp-viewing-version="${escHtml(String(viewingVersion || ''))}"`
    + ` data-pp-current-version="${escHtml(String(currentVersion || 1))}"`
    + `>${INFO_PANEL_JS}\n</script>`;

  return headerBar + sidebar + infoPanel;
}
