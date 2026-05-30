// Pre-computed dashboard CSS — loaded once at module init

export const DASHBOARD_CSS = `
  body { min-height: 100vh; display: flex; flex-direction: column; padding-top: 48px; }

  main { max-width: 960px; margin: 0 auto; padding: 32px 24px; flex: 1; width: 100%; }

  /* --- Tabs --- */
  .tab-bar { display: flex; gap: 2px; margin-bottom: 24px; border-bottom: 1px solid var(--pp-border); padding-bottom: 0; overflow-x: auto; }
  .tab-btn { background: none; border: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--pp-text-muted); padding: 10px 16px; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; white-space: nowrap; }
  .tab-btn:hover { color: var(--pp-text); }
  .tab-btn.active { color: var(--pp-accent); border-bottom-color: var(--pp-accent); }
  .tab-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 10px; font-weight: 700; background: var(--pp-surface-2); color: var(--pp-text-muted); margin-left: 6px; }
  .tab-btn.active .tab-count { background: var(--pp-accent-soft); color: var(--pp-accent); }

  /* --- Stats --- */
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 16px; box-shadow: var(--pp-shadow-sm); transition: box-shadow .15s; }
  .stat:hover { box-shadow: var(--pp-shadow-md); }
  .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .stat-label { font-size: 10px; color: var(--pp-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; font-weight: 600; }
  .stat-value.accent { color: var(--pp-accent); }
  .stat-hint { font-size: 10px; color: var(--pp-text-muted); margin-top: 4px; line-height: 1.3; opacity: 0.7; }

  /* --- Sections --- */
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pp-text-muted); margin-bottom: 12px; }
  .tab-section { display: none; }
  .tab-section.active { display: block; }

  /* --- Filter toolbar --- */
  .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-input { flex: 1; min-width: 180px; padding: 8px 12px; border: 1px solid var(--pp-border); border-radius: var(--pp-radius); background: var(--pp-surface-1); color: var(--pp-text); font-family: inherit; font-size: 13px; transition: border-color .15s; }
  .filter-input:focus { border-color: var(--pp-accent); outline: none; box-shadow: 0 0 0 3px var(--pp-accent-soft); }
  .filter-select { padding: 8px 12px; border: 1px solid var(--pp-border); border-radius: var(--pp-radius); background: var(--pp-surface-1); color: var(--pp-text); font-family: inherit; font-size: 12px; cursor: pointer; }
  .filter-result-count { font-size: 11px; color: var(--pp-text-muted); padding: 0 4px; white-space: nowrap; }

  /* --- Tables --- */
  table { width: 100%; border-collapse: collapse; background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); overflow: hidden; box-shadow: var(--pp-shadow-sm); }
  th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--pp-text-muted); padding: 10px 16px; background: var(--pp-surface-2); border-bottom: 1px solid var(--pp-border); }
  td { padding: 12px 16px; border-bottom: 1px solid var(--pp-border); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--pp-surface-1); }
  .muted { color: var(--pp-text-muted); }

  /* Sortable headers */
  th[data-sort] { cursor: pointer; user-select: none; transition: color .15s; }
  th[data-sort]:hover { color: var(--pp-text); }
  .sort-icon { font-size: 10px; opacity: 0.4; margin-left: 4px; }
  th[data-sort].sort-asc .sort-icon, th[data-sort].sort-desc .sort-icon { opacity: 1; color: var(--pp-accent); }

  /* --- Session links & badges --- */
  .session-link { color: var(--pp-accent); text-decoration: none; font-weight: 600; transition: color .15s; }
  .session-link:hover { color: var(--pp-accent-hover); text-decoration: underline; text-underline-offset: 2px; }
  .comment-badge { background: var(--pp-accent-soft); color: var(--pp-accent); padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .badge-new { background: var(--pp-accent-soft); color: var(--pp-accent); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-stale { background: var(--pp-warning-bg); color: var(--pp-warning); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-archived { background: var(--pp-surface-2); color: var(--pp-text-muted); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-private { background: light-dark(#f3e8ff,#2e1065); color: light-dark(#7c3aed,#c4b5fd); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-admin { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: var(--pp-success-bg); color: var(--pp-success); margin-left: 8px; letter-spacing: 0.02em; }
  .badge-deactivated { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: var(--pp-error-bg); color: var(--pp-error); margin-left: 8px; }
  .badge-resolved { background: var(--pp-success-bg); color: var(--pp-success); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .badge-open { background: var(--pp-warning-bg); color: var(--pp-warning); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  tr.row-archived td { opacity: 0.5; }

  /* --- Action buttons --- */
  .action-btn { background: none; border: 1px solid var(--pp-border); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-family: inherit; cursor: pointer; color: var(--pp-text-muted); transition: all .15s; }
  .action-btn:hover { background: var(--pp-surface-2); color: var(--pp-text); border-color: var(--pp-border-bold); }
  .action-btn-danger { color: var(--pp-error); }
  .action-btn-danger:hover { background: var(--pp-error-bg); border-color: var(--pp-error); color: var(--pp-error); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* --- Pagination --- */
  .pagination { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 16px; }
  .page-btn { background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer; color: var(--pp-text); transition: all .15s; }
  .page-btn:hover { background: var(--pp-surface-2); border-color: var(--pp-border-bold); }
  .page-btn.active { background: var(--pp-accent); color: #fff; border-color: var(--pp-accent); }
  .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .page-info { font-size: 11px; color: var(--pp-text-muted); padding: 0 8px; }

  /* --- Empty states --- */
  .empty { text-align: center; padding: 48px 24px; color: var(--pp-text-muted); font-size: 13px; }
  .empty code { background: var(--pp-surface-2); padding: 2px 8px; border-radius: 4px; font-family: var(--pp-font-mono); font-size: 12px; }
  .empty-title { font-size: 15px; font-weight: 700; color: var(--pp-text); margin-bottom: 8px; }
  .empty-desc { font-size: 13px; color: var(--pp-text-muted); line-height: 1.6; max-width: 400px; margin: 0 auto; }

  /* --- Activity feed --- */
  .activity-list { list-style: none; }
  .activity-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--pp-border); font-size: 13px; background: var(--pp-surface-1); }
  .activity-item:first-child { border-radius: var(--pp-radius-lg) var(--pp-radius-lg) 0 0; }
  .activity-item:last-child { border-bottom: none; border-radius: 0 0 var(--pp-radius-lg) var(--pp-radius-lg); }
  .activity-item:only-child { border-radius: var(--pp-radius-lg); }
  .activity-list { border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); box-shadow: var(--pp-shadow-sm); overflow: hidden; }
  .activity-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .activity-icon-push { background: var(--pp-accent-soft); color: var(--pp-accent); }
  .activity-icon-comment { background: var(--pp-warning-bg); color: var(--pp-warning); }
  .activity-icon-resolve { background: var(--pp-success-bg); color: var(--pp-success); }
  .activity-icon-delete { background: var(--pp-error-bg); color: var(--pp-error); }
  .activity-icon-archive { background: var(--pp-surface-2); color: var(--pp-text-muted); }
  .activity-icon-user { background: var(--pp-accent-soft); color: var(--pp-accent); }
  .activity-body { flex: 1; min-width: 0; }
  .activity-actor { font-weight: 600; }
  .activity-time { font-size: 11px; color: var(--pp-text-muted); margin-top: 2px; }
  .activity-target { color: var(--pp-accent); text-decoration: none; font-weight: 500; }
  .activity-target:hover { text-decoration: underline; }

  /* --- Comment excerpt --- */
  .comment-excerpt { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* --- Token section --- */
  .token-label { font-weight: 600; }
  .token-meta { font-size: 11px; color: var(--pp-text-muted); }
  .section-desc { font-size: 12px; color: var(--pp-text-muted); margin-bottom: 14px; line-height: 1.5; }
  .section-desc code { background: var(--pp-surface-2); padding: 2px 6px; border-radius: 4px; font-family: var(--pp-font-mono); font-size: 11px; }

  /* --- Card (integrations) --- */
  .card { background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 18px; box-shadow: var(--pp-shadow-sm); }
  .card-header { display: flex; align-items: center; gap: 12px; }
  .card-desc { font-size: 12px; color: var(--pp-text-muted); margin-top: 10px; line-height: 1.6; }

  /* --- Mobile session cards --- */
  .mobile-sessions { display: none; }
  .session-card { background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--pp-shadow-sm); }
  .session-card-title { font-weight: 600; margin-bottom: 4px; }
  .session-card-title a { color: var(--pp-accent); text-decoration: none; font-size: 14px; }
  .session-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--pp-text-muted); align-items: center; }
  .session-card-meta .comment-badge { font-size: 10px; padding: 1px 6px; }
  .session-card-actions { margin-top: 8px; display: flex; gap: 6px; }

  /* --- Settings section --- */
  .settings-grid { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 24px; }
  @media (min-width: 768px) { .settings-grid { grid-template-columns: 1fr 1fr; } }
  .settings-section { background: var(--pp-surface-1); border: 1px solid var(--pp-border); border-radius: var(--pp-radius-lg); padding: 20px; box-shadow: var(--pp-shadow-sm); }
  .settings-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pp-text); margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--pp-border); }
  .settings-group { margin-bottom: 16px; }
  .settings-label { display: block; font-size: 12px; font-weight: 600; color: var(--pp-text); margin-bottom: 6px; }
  .settings-field { display: flex; gap: 8px; align-items: center; }
  .settings-input { flex: 1; min-width: 0; padding: 8px 12px; border: 1px solid var(--pp-border); border-radius: var(--pp-radius); background: var(--pp-surface-2); color: var(--pp-text); font-family: inherit; font-size: 13px; transition: border-color .15s; }
  .settings-input:focus { border-color: var(--pp-accent); outline: none; box-shadow: 0 0 0 3px var(--pp-accent-soft); }
  .settings-input:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-textarea { flex: 1; padding: 8px 12px; border: 1px solid var(--pp-border); border-radius: var(--pp-radius); background: var(--pp-surface-2); color: var(--pp-text); font-family: var(--pp-font-mono); font-size: 12px; min-height: 80px; resize: vertical; transition: border-color .15s; }
  .settings-textarea:focus { border-color: var(--pp-accent); outline: none; box-shadow: 0 0 0 3px var(--pp-accent-soft); }
  .settings-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-secret-replace { padding: 6px 12px; border: 1px solid var(--pp-border); border-radius: 6px; background: var(--pp-surface-1); color: var(--pp-text); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; }
  .settings-secret-replace:hover { background: var(--pp-surface-2); border-color: var(--pp-border-bold); }
  .test-connection-btn { padding: 6px 12px; border: 1px solid var(--pp-border); border-radius: 6px; background: var(--pp-accent-soft); color: var(--pp-accent); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; }
  .test-connection-btn:hover { background: var(--pp-accent); color: white; }
  .test-connection-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-hint { font-size: 11px; color: var(--pp-text-muted); margin-top: 4px; }
  .settings-actions { display: flex; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--pp-border); }
  .btn-primary { padding: 8px 20px; background: var(--pp-accent); color: white; border: none; border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; }
  .btn-primary:hover { background: var(--pp-accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary { padding: 8px 20px; background: var(--pp-surface-1); color: var(--pp-text); border: 1px solid var(--pp-border); border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; }
  .btn-secondary:hover { background: var(--pp-surface-2); border-color: var(--pp-border-bold); }
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-status { font-size: 12px; color: var(--pp-text-muted); align-self: center; }
  .restart-banner { background: var(--pp-warning-bg); color: var(--pp-warning); border: 1px solid var(--pp-warning); border-radius: var(--pp-radius-lg); padding: 16px; margin-bottom: 20px; }
  .restart-banner-content { font-size: 13px; }
  .restart-banner-content strong { font-weight: 700; }
  .restart-banner-content p { margin: 6px 0 0 0; font-size: 12px; line-height: 1.5; }

  /* --- Footer --- */
  footer { background: var(--pp-surface-1); border-top: 1px solid var(--pp-border); padding: 18px 24px; text-align: center; font-size: 11px; color: var(--pp-text-muted); letter-spacing: 0.02em; }

  /* --- Responsive --- */
  @media (max-width: 640px) {
    main { padding: 16px; }
    .stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .stat { padding: 12px; }
    .stat-value { font-size: 22px; }
    .desktop-table { display: none; }
    .mobile-sessions { display: block; }
    th, td { padding: 8px 12px; }
    .filter-bar { flex-direction: column; }
    .filter-input { min-width: 100%; }
    .tab-bar { gap: 0; }
    .tab-btn { padding: 8px 12px; font-size: 11px; }
  }

  /* --- Reduce motion --- */
  @media (prefers-reduced-motion: reduce) {
    *{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}
  }
`;
