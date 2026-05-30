// Pre-computed client-side JS for the dashboard — loaded once at module init

export const DASHBOARD_JS = `
(function() {
  var PAGE_SIZE = 25;

  // --- State ---
  var state = {
    sortCol: 'updated',
    sortDir: 'desc',
    search: '',
    statusFilter: '',
    page: 0
  };

  // --- DOM helpers ---
  function $(id) { return document.getElementById(id); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // --- Debounce ---
  function debounce(fn, ms) {
    var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // --- Tab switching ---
  function initTabs() {
    var tabs = $$('.tab-btn');
    var sections = $$('.tab-section');
    tabs.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        tabs.forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        sections.forEach(function(s) {
          s.classList.toggle('active', s.dataset.section === tab);
        });
      });
    });
  }

  // --- Get table rows ---
  function getDesktopRows() { return $$('#sessions-tbody tr[data-id]'); }
  function getMobileCards() { return $$('#mobile-sessions-list .session-card[data-id]'); }

  // --- Filter logic ---
  function matchesFilter(el) {
    var title = (el.dataset.title || '').toLowerCase();
    var creator = (el.dataset.creator || '').toLowerCase();
    var query = state.search.toLowerCase();
    if (query && title.indexOf(query) === -1 && creator.indexOf(query) === -1) return false;

    var f = state.statusFilter;
    if (f === 'open' && el.dataset.openComments === '0') return false;
    if (f === 'new' && el.dataset.isNew !== '1') return false;
    if (f === 'stale' && el.dataset.isStale !== '1') return false;
    if (f === 'archived' && el.dataset.archived !== '1') return false;
    if (f === 'private' && el.dataset.private !== '1') return false;
    if (f === 'mine' && el.dataset.isMine !== '1') return false;

    // By default, hide archived sessions unless specifically filtering for them
    if (f !== 'archived' && el.dataset.archived === '1') return false;

    return true;
  }

  // --- Sort comparator ---
  function compareVal(a, b, col) {
    var av, bv;
    if (col === 'title') { av = a.dataset.title.toLowerCase(); bv = b.dataset.title.toLowerCase(); return av < bv ? -1 : av > bv ? 1 : 0; }
    if (col === 'creator') { av = a.dataset.creator.toLowerCase(); bv = b.dataset.creator.toLowerCase(); return av < bv ? -1 : av > bv ? 1 : 0; }
    if (col === 'updated') { av = a.dataset.updated; bv = b.dataset.updated; return av < bv ? -1 : av > bv ? 1 : 0; }
    if (col === 'created') { av = a.dataset.created; bv = b.dataset.created; return av < bv ? -1 : av > bv ? 1 : 0; }
    if (col === 'open_comments') { av = parseInt(a.dataset.openComments, 10); bv = parseInt(b.dataset.openComments, 10); return av - bv; }
    if (col === 'comment_count') { av = parseInt(a.dataset.commentCount, 10); bv = parseInt(b.dataset.commentCount, 10); return av - bv; }
    return 0;
  }

  // --- Apply all: filter + sort + paginate ---
  function applyAll() {
    var rows = getDesktopRows();
    var cards = getMobileCards();

    // Filter
    var visibleIds = [];
    rows.forEach(function(row) {
      var match = matchesFilter(row);
      row._dashMatch = match;
      if (match) visibleIds.push(row.dataset.id);
    });
    cards.forEach(function(card) { card._dashMatch = matchesFilter(card); });

    // Sort desktop rows
    var visibleRows = rows.filter(function(r) { return r._dashMatch; });
    var dir = state.sortDir === 'asc' ? 1 : -1;
    visibleRows.sort(function(a, b) { return dir * compareVal(a, b, state.sortCol); });

    // Paginate
    var totalVisible = visibleRows.length;
    var totalPages = Math.max(1, Math.ceil(totalVisible / PAGE_SIZE));
    if (state.page >= totalPages) state.page = totalPages - 1;
    var start = state.page * PAGE_SIZE;
    var end = start + PAGE_SIZE;

    // Apply visibility to desktop rows
    var tbody = $('sessions-tbody');
    if (tbody) {
      rows.forEach(function(r) { r.style.display = 'none'; });
      visibleRows.forEach(function(r, i) {
        if (i >= start && i < end) {
          r.style.display = '';
          tbody.appendChild(r); // reorder in DOM
        }
      });
    }

    // Sort and apply visibility to mobile cards
    var visibleCards = cards.filter(function(c) { return c._dashMatch; });
    visibleCards.sort(function(a, b) { return dir * compareVal(a, b, state.sortCol); });
    var mobileList = $('mobile-sessions-list');
    cards.forEach(function(c) { c.style.display = 'none'; });
    visibleCards.forEach(function(c, i) {
      if (i >= start && i < end) {
        c.style.display = '';
        if (mobileList) mobileList.appendChild(c); // reorder in DOM
      }
    });

    // Update sort header indicators
    $$('th[data-sort]').forEach(function(th) {
      th.classList.remove('sort-asc', 'sort-desc');
      var icon = th.querySelector('.sort-icon');
      if (icon) icon.innerHTML = '\\u2195';
      if (th.dataset.sort === state.sortCol) {
        th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        if (icon) icon.innerHTML = state.sortDir === 'asc' ? '\\u25B2' : '\\u25BC';
      }
    });

    // Update result count
    var countEl = $('dash-result-count');
    if (countEl) {
      countEl.textContent = totalVisible === rows.length ? '' : totalVisible + ' of ' + rows.length + ' sessions';
    }

    // Show/hide no-results message
    var noResults = $('sessions-no-results');
    var table = $('sessions-table');
    var mobileList = $('mobile-sessions-list');
    if (noResults) noResults.style.display = (rows.length > 0 && totalVisible === 0) ? '' : 'none';
    if (table) table.style.display = (totalVisible === 0) ? 'none' : '';
    if (mobileList) mobileList.style.display = (totalVisible === 0) ? 'none' : '';

    renderPagination(totalVisible, totalPages);
  }

  // --- Pagination ---
  function renderPagination(total, totalPages) {
    var el = $('pagination');
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    var html = '';
    html += '<button class="page-btn" data-page="prev"' + (state.page === 0 ? ' disabled' : '') + '>&laquo; Prev</button>';

    // Show up to 7 page buttons with ellipsis
    var pages = [];
    for (var i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || (i >= state.page - 2 && i <= state.page + 2)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== -1) {
        pages.push(-1); // ellipsis marker
      }
    }
    pages.forEach(function(p) {
      if (p === -1) {
        html += '<span class="page-info">...</span>';
      } else {
        html += '<button class="page-btn' + (p === state.page ? ' active' : '') + '" data-page="' + p + '">' + (p + 1) + '</button>';
      }
    });

    html += '<button class="page-btn" data-page="next"' + (state.page >= totalPages - 1 ? ' disabled' : '') + '>Next &raquo;</button>';
    html += '<span class="page-info">' + total + ' total</span>';
    el.innerHTML = html;
  }

  // --- Actions ---
  function handleAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var row = btn.closest('tr[data-id]') || btn.closest('.session-card[data-id]');
    if (!row) {
      // Handle token revoke
      if (action === 'revoke-token') {
        var tokenRow = btn.closest('tr[data-token-id]');
        if (tokenRow) revokeToken(tokenRow.dataset.tokenId, btn, tokenRow);
      }
      return;
    }
    var id = row.dataset.id;
    if (action === 'delete') deleteSession(id, btn, row);
    if (action === 'archive') archiveSession(id, btn, row);
    if (action === 'publish') publishSession(id, btn, row);
  }

  function deleteSession(id, btn, row) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    btn.disabled = true;
    btn.textContent = '...';
    fetch('/api/sessions/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('Delete failed');
        // Remove from both desktop and mobile
        $$('[data-id="' + CSS.escape(id) + '"]').forEach(function(el) { el.remove(); });
        recalcStats();
        applyAll();
      })
      .catch(function() { btn.disabled = false; btn.textContent = 'Delete'; alert('Failed to delete session.'); });
  }

  function archiveSession(id, btn, row) {
    var isArchived = row.dataset.archived === '1';
    btn.disabled = true;
    btn.textContent = '...';
    fetch('/api/sessions/' + encodeURIComponent(id) + '/archive', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !isArchived })
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Archive failed');
      return r.json();
    })
    .then(function(data) {
      // Update all matching elements (desktop + mobile)
      $$('[data-id="' + CSS.escape(id) + '"]').forEach(function(el) {
        el.dataset.archived = data.archived ? '1' : '0';
        if (data.archived) { el.classList.add('row-archived'); } else { el.classList.remove('row-archived'); }
        // Update badges
        el.querySelectorAll('.badge-archived').forEach(function(b) { b.remove(); });
        if (data.archived) {
          var link = el.querySelector('.session-link, .session-card-title a');
          if (link && link.parentNode) {
            var badge = document.createElement('span');
            badge.className = 'badge-archived';
            badge.textContent = 'Archived';
            link.parentNode.insertBefore(badge, link.nextSibling);
          }
        }
        // Update button text
        el.querySelectorAll('[data-action="archive"]').forEach(function(b) {
          b.textContent = data.archived ? 'Unarchive' : 'Archive';
          b.disabled = false;
        });
      });
      recalcStats();
      applyAll();
    })
    .catch(function() { btn.disabled = false; btn.textContent = isArchived ? 'Unarchive' : 'Archive'; alert('Failed to update session.'); });
  }

  function publishSession(id, btn, row) {
    if (!confirm('Publish this plan?\\n\\nOnce published, all team members will be able to view it. This cannot be undone.')) return;
    btn.disabled = true;
    btn.textContent = '...';
    fetch('/api/sessions/' + encodeURIComponent(id) + '/publish', {
      method: 'POST',
      credentials: 'same-origin'
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Publish failed');
      // Update all matching elements (desktop + mobile)
      $$('[data-id="' + CSS.escape(id) + '"]').forEach(function(el) {
        el.dataset.private = '0';
        // Remove private badges
        el.querySelectorAll('.badge-private').forEach(function(b) { b.remove(); });
        // Remove publish buttons
        el.querySelectorAll('[data-action="publish"]').forEach(function(b) { b.remove(); });
      });
      recalcStats();
      applyAll();
    })
    .catch(function() { btn.disabled = false; btn.textContent = 'Publish'; alert('Failed to publish session.'); });
  }

  function revokeToken(tokenId, btn, row) {
    if (!confirm('Revoke this token? The device will need to re-authenticate.')) return;
    btn.disabled = true;
    btn.textContent = '...';
    fetch('/api/tokens/' + encodeURIComponent(tokenId), { method: 'DELETE', credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('Revoke failed');
        row.remove();
        // Update token tab count
        var remaining = $$('#tokens-tbody tr').length;
        $$('.tab-btn[data-tab="tokens"] .tab-count').forEach(function(el) { el.textContent = remaining; });
      })
      .catch(function() { btn.disabled = false; btn.textContent = 'Revoke'; alert('Failed to revoke token.'); });
  }

  function recalcStats() {
    var rows = getDesktopRows();
    var activeRows = rows.filter(function(r) { return r.dataset.archived !== '1'; });
    var sessionCount = activeRows.length;
    var openComments = 0;
    activeRows.forEach(function(r) { openComments += parseInt(r.dataset.openComments, 10) || 0; });

    var sc = $('stat-sessions');
    var oc = $('stat-open-comments');
    if (sc) sc.textContent = sessionCount;
    if (oc) oc.textContent = openComments;

    // Update session tab count
    $$('.tab-btn[data-tab="sessions"] .tab-count').forEach(function(el) { el.textContent = sessionCount; });
  }

  // --- Record views (fire and forget) ---
  function recordViews() {
    var rows = getDesktopRows();
    var ids = rows.map(function(r) { return r.dataset.id; });
    if (ids.length === 0) return;
    fetch('/api/dashboard/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ session_ids: ids })
    }).catch(function() {});
  }

  // --- Init ---
  initTabs();

  // Bind filter events
  var search = $('dash-search');
  var statusFilter = $('dash-status-filter');
  if (search) search.addEventListener('input', debounce(function() { state.search = search.value; state.page = 0; applyAll(); }, 200));
  if (statusFilter) statusFilter.addEventListener('change', function() { state.statusFilter = statusFilter.value; state.page = 0; applyAll(); });

  // Bind sort headers
  $$('th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var col = th.dataset.sort;
      if (state.sortCol === col) { state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { state.sortCol = col; state.sortDir = col === 'title' || col === 'creator' ? 'asc' : 'desc'; }
      state.page = 0;
      applyAll();
    });
  });

  // Bind pagination (event delegation)
  var pagination = $('pagination');
  if (pagination) {
    pagination.addEventListener('click', function(e) {
      var btn = e.target.closest('.page-btn');
      if (!btn || btn.disabled) return;
      var p = btn.dataset.page;
      if (p === 'prev') state.page = Math.max(0, state.page - 1);
      else if (p === 'next') state.page++;
      else state.page = parseInt(p, 10);
      applyAll();
    });
  }

  // Bind action buttons (event delegation on sessions)
  var sessionsSection = document.querySelector('[data-section="sessions"]');
  if (sessionsSection) sessionsSection.addEventListener('click', handleAction);

  // Bind token actions
  var tokensSection = document.querySelector('[data-section="tokens"]');
  if (tokensSection) tokensSection.addEventListener('click', handleAction);

  // --- Settings tab ---
  var settingsSection = document.querySelector('[data-section="settings"]');
  if (settingsSection) {
    initSettings();
  }

  function initSettings() {
    var settingsLoading = document.getElementById('settings-loading');
    var settingsContent = document.getElementById('settings-content');
    var restartBanner = document.getElementById('restart-banner');
    var saveBtn = document.getElementById('settings-save');
    var cancelBtn = document.getElementById('settings-cancel');
    var statusEl = document.getElementById('settings-status');

    // Load settings from API
    fetch('/api/admin/settings', { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('Failed to load settings');
        return r.json();
      })
      .then(function(data) {
        // Populate form fields
        populateSettingsForm(data.settings);
        settingsLoading.style.display = 'none';
        settingsContent.style.display = 'block';
      })
      .catch(function(err) {
        console.error('Settings load error:', err);
        var errDiv = document.createElement('div');
        errDiv.className = 'empty';
        var titleDiv = document.createElement('div');
        titleDiv.className = 'empty-title';
        titleDiv.textContent = 'Error loading settings';
        var descDiv = document.createElement('div');
        descDiv.className = 'empty-desc';
        descDiv.textContent = err.message;
        errDiv.appendChild(titleDiv);
        errDiv.appendChild(descDiv);
        settingsLoading.parentNode.replaceChild(errDiv, settingsLoading);
      });

    function populateSettingsForm(settings) {
      settings.forEach(function(setting) {
        var input = document.getElementById('setting-' + setting.key);
        if (!input) return;

        // Mark read-only fields
        if (setting.isLocked) {
          input.disabled = true;
          input.title = 'Set via environment variable';
        }

        // For secret fields, show placeholder instead of value
        if (setting.isSecret) {
          input.type = 'password';
          input.placeholder = setting.isSet ? '••••••••••••' : '(not set)';
          input.value = '';
          // Show test connection button for OKTA_ISSUER
          if (setting.key === 'OKTA_ISSUER') {
            var testBtn = document.querySelector('button[data-field="OKTA_ISSUER"]');
            if (testBtn && setting.isSet) testBtn.style.display = 'inline-block';
          }
        } else {
          // For non-secret fields, show actual value
          if (setting.key === 'INITIAL_ADMIN_EMAILS') {
            input.value = setting.value || '';
          } else {
            input.value = setting.value || '';
          }
        }
      });
    }

    // Save settings
    saveBtn.addEventListener('click', function() {
      saveSettings();
    });

    // Cancel
    cancelBtn.addEventListener('click', function() {
      location.reload();
    });

    function saveSettings() {
      saveBtn.disabled = true;
      statusEl.textContent = 'Saving...';
      statusEl.style.color = 'var(--pp-text-muted)';

      var updates = {};
      var fieldsToSave = ['AUTH_PROVIDER', 'OKTA_ISSUER', 'OKTA_CLIENT_ID', 'OKTA_CLIENT_SECRET',
                          'INITIAL_ADMIN_EMAILS', 'SLACK_WEBHOOK_URL', 'SCIM_AUTH_TOKEN', 'BASE_URL'];

      fieldsToSave.forEach(function(key) {
        var input = document.getElementById('setting-' + key);
        if (input && !input.disabled) {
          var value = input.value.trim();
          // Only include non-empty secret fields (empty means unchanged)
          if (key === 'OKTA_CLIENT_ID' || key === 'OKTA_CLIENT_SECRET' ||
              key === 'SLACK_WEBHOOK_URL' || key === 'SCIM_AUTH_TOKEN') {
            // For secret fields, only send if user explicitly entered something
            if (value && input.type === 'password' && value !== '••••••••••••') {
              updates[key] = value;
            }
          } else {
            // For non-secret fields, always send
            updates[key] = value || null;
          }
        }
      });

      fetch('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: updates })
      })
      .then(function(r) {
        if (!r.ok) {
          var contentType = r.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return r.json().then(function(data) {
              throw new Error(data.error || 'Failed to save settings');
            });
          }
          throw new Error('Failed to save settings');
        }
        return r.json();
      })
      .then(function(data) {
        statusEl.textContent = 'Settings saved!';
        statusEl.style.color = 'var(--pp-success)';
        if (data.restartRequired) {
          restartBanner.style.display = 'block';
        }
        // Reload after 1s to refresh values
        setTimeout(function() { location.reload(); }, 1000);
      })
      .catch(function(err) {
        console.error('Save error:', err);
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = 'var(--pp-error)';
        saveBtn.disabled = false;
      });
    }

    // Test Okta connection
    var testBtns = document.querySelectorAll('.test-connection-btn');
    testBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var field = btn.dataset.field;
        var issuerInput = document.getElementById('setting-OKTA_ISSUER');
        if (!issuerInput) return;

        var issuer = issuerInput.value.trim();
        if (!issuer) {
          alert('Please enter an Okta issuer URL first');
          return;
        }

        btn.disabled = true;
        var origText = btn.textContent;
        btn.textContent = 'Testing...';

        fetch('/api/admin/settings/test-connection', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issuer: issuer })
        })
        .then(function(r) {
          if (!r.ok) {
            return r.json().then(function(data) {
              throw new Error(data.error || 'Test failed');
            });
          }
          return r.json();
        })
        .then(function(data) {
          alert('Connection successful!\\nIssuer: ' + data.issuer);
          btn.disabled = false;
          btn.textContent = origText;
        })
        .catch(function(err) {
          alert('Connection failed: ' + err.message);
          btn.disabled = false;
          btn.textContent = origText;
        });
      });
    });
  }

  // Initial render
  applyAll();

  // Record views after 1s delay
  setTimeout(recordViews, 1000);
})();`;
