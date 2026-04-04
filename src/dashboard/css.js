// Pre-computed dashboard CSS — loaded once at module init

export const DASHBOARD_CSS = `
  body { min-height: 100vh; display: flex; flex-direction: column; padding-top: 48px; }
  @media(prefers-color-scheme:dark){.pp-header-btn:hover{background:var(--bg3,#1c2128)}}

  main { max-width: 960px; margin: 0 auto; padding: 32px 24px; flex: 1; width: 100%; }

  /* --- Tabs --- */
  .tab-bar { display: flex; gap: 2px; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 0; overflow-x: auto; }
  .tab-btn { background: none; border: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--muted); padding: 10px 16px; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; white-space: nowrap; }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 10px; font-weight: 700; background: var(--bg3); color: var(--muted); margin-left: 6px; }
  .tab-btn.active .tab-count { background: var(--accent-bg); color: var(--accent); }

  /* --- Stats --- */
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; box-shadow: var(--shadow-sm); transition: box-shadow .15s; }
  .stat:hover { box-shadow: var(--shadow-md); }
  .stat-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; font-weight: 600; }
  .stat-value.accent { color: var(--accent); }

  /* --- Sections --- */
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; }
  .tab-section { display: none; }
  .tab-section.active { display: block; }

  /* --- Filter toolbar --- */
  .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-input { flex: 1; min-width: 180px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg2); color: var(--text); font-family: inherit; font-size: 13px; transition: border-color .15s; }
  .filter-input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-bg); }
  .filter-select { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg2); color: var(--text); font-family: inherit; font-size: 12px; cursor: pointer; }
  .filter-result-count { font-size: 11px; color: var(--muted); padding: 0 4px; white-space: nowrap; }

  /* --- Tables --- */
  table { width: 100%; border-collapse: collapse; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
  th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 10px 16px; background: var(--bg3); border-bottom: 1px solid var(--border); }
  td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg2); }
  .muted { color: var(--muted); }

  /* Sortable headers */
  th[data-sort] { cursor: pointer; user-select: none; transition: color .15s; }
  th[data-sort]:hover { color: var(--text); }
  .sort-icon { font-size: 10px; opacity: 0.4; margin-left: 4px; }
  th[data-sort].sort-asc .sort-icon, th[data-sort].sort-desc .sort-icon { opacity: 1; color: var(--accent); }

  /* --- Session links & badges --- */
  .session-link { color: var(--accent); text-decoration: none; font-weight: 600; transition: color .15s; }
  .session-link:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 2px; }
  .comment-badge { background: var(--accent-bg); color: var(--accent); padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .badge-new { background: var(--accent-bg); color: var(--accent); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-stale { background: var(--warning-bg); color: var(--warning); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-archived { background: var(--bg3); color: var(--muted); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 8px; }
  .badge-admin { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: var(--success-bg); color: var(--success); margin-left: 8px; letter-spacing: 0.02em; }
  .badge-deactivated { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: var(--error-bg); color: var(--error); margin-left: 8px; }
  .badge-resolved { background: var(--success-bg); color: var(--success); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .badge-open { background: var(--warning-bg); color: var(--warning); padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  tr.row-archived td { opacity: 0.5; }

  /* --- Action buttons --- */
  .action-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-family: inherit; cursor: pointer; color: var(--muted); transition: all .15s; }
  .action-btn:hover { background: var(--bg3); color: var(--text); border-color: var(--border-bold); }
  .action-btn-danger { color: var(--error); }
  .action-btn-danger:hover { background: var(--error-bg); border-color: var(--error); color: var(--error); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* --- Pagination --- */
  .pagination { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 16px; }
  .page-btn { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer; color: var(--text); transition: all .15s; }
  .page-btn:hover { background: var(--bg3); border-color: var(--border-bold); }
  .page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .page-info { font-size: 11px; color: var(--muted); padding: 0 8px; }

  /* --- Empty states --- */
  .empty { text-align: center; padding: 48px 24px; color: var(--muted); font-size: 13px; }
  .empty code { background: var(--bg3); padding: 2px 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; }
  .empty-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .empty-desc { font-size: 13px; color: var(--muted); line-height: 1.6; max-width: 400px; margin: 0 auto; }

  /* --- Activity feed --- */
  .activity-list { list-style: none; }
  .activity-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; background: var(--bg2); }
  .activity-item:first-child { border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
  .activity-item:last-child { border-bottom: none; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
  .activity-item:only-child { border-radius: var(--radius-lg); }
  .activity-list { border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
  .activity-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .activity-icon-push { background: var(--accent-bg); color: var(--accent); }
  .activity-icon-comment { background: var(--warning-bg); color: var(--warning); }
  .activity-icon-resolve { background: var(--success-bg); color: var(--success); }
  .activity-icon-delete { background: var(--error-bg); color: var(--error); }
  .activity-icon-archive { background: var(--bg3); color: var(--muted); }
  .activity-icon-user { background: var(--accent-bg); color: var(--accent); }
  .activity-body { flex: 1; min-width: 0; }
  .activity-actor { font-weight: 600; }
  .activity-time { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .activity-target { color: var(--accent); text-decoration: none; font-weight: 500; }
  .activity-target:hover { text-decoration: underline; }

  /* --- Comment excerpt --- */
  .comment-excerpt { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* --- Token section --- */
  .token-label { font-weight: 600; }
  .token-meta { font-size: 11px; color: var(--muted); }

  /* --- Card (integrations) --- */
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow-sm); }
  .card-header { display: flex; align-items: center; gap: 12px; }
  .card-desc { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.6; }

  /* --- Mobile session cards --- */
  .mobile-sessions { display: none; }
  .session-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--shadow-sm); }
  .session-card-title { font-weight: 600; margin-bottom: 4px; }
  .session-card-title a { color: var(--accent); text-decoration: none; font-size: 14px; }
  .session-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); align-items: center; }
  .session-card-meta .comment-badge { font-size: 10px; padding: 1px 6px; }
  .session-card-actions { margin-top: 8px; display: flex; gap: 6px; }

  /* --- Footer --- */
  footer { background: var(--bg2); border-top: 1px solid var(--border); padding: 18px 24px; text-align: center; font-size: 11px; color: var(--muted); letter-spacing: 0.02em; }

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
`;
