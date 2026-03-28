# PlanPush

Self-hosted design doc collaboration server + Claude Code plugin marketplace.

## Project Structure

- `src/` — Express.js server (Node 22+, Knex.js for SQLite/PostgreSQL)
- `plugins/` — Claude Code plugin marketplace
- `.claude-plugin/marketplace.json` — marketplace manifest

## Plugin Commands

The PlanPush plugin commands live in this repo at `plugins/planpush/commands/`:
- `planpush.md` — main push skill (`/planpush:planpush`)
- `planpush-auth.md` — device-flow auth skill (`/planpush:planpush-auth`)

When updating PlanPush plugin commands, edit the files in this repo — not the old `planpush.plugins` repo.

## Running Locally

```
npm install
npm run dev
```

Server runs on port 3000. Requires `.env` (see `.env.example`).

## Database

- Uses **Knex.js** query builder directly (no adapter shim)
- Default: SQLite via `better-sqlite3` (zero-config)
- PostgreSQL: set `DATABASE_URL=postgres://...` in `.env`
- KV store is database-backed (`kv_store` table), not filesystem
- Migrations: JS files in `src/migrations/`, auto-run at startup via `knex.migrate.latest()`
- Routes import `knex` directly from `db.js` — no `app.locals` indirection

## Security

- `helmet` for global security headers (HSTS, X-Content-Type-Options, Referrer-Policy, etc.)
- `express-rate-limit` on all auth endpoints (30 req / 15 min)
- Docker runs Node as non-root `planpush` user via `su-exec` entrypoint
- `SECRET_KEY` must be >= 32 characters (enforced at startup)
- Device token redemption is atomic (transaction prevents double-refresh-token issuance)
- Auth check via `requireAuthOrRedirect` middleware (prevents session existence leaks)
- Comment content capped at 4000 chars, anchor at 200
- Slack messages escape user content for mrkdwn injection prevention

## Key Patterns

- Auth: GitHub OAuth (web) + RFC 8628 device flow (CLI)
- HTML sanitization via cheerio (no inline scripts allowed in pushed docs)
- CSP with nonces for all inline scripts (base64url encoding)
- Plan CSS/JS injected server-side, not authored by users
- Graceful shutdown on SIGTERM/SIGINT (drains connections, destroys DB pool)
- `req.planpushBaseUrl` middleware computes base URL once per request
- Shared `BASE_PAGE_CSS` constant for consistent design tokens across all HTML pages
- Comment overlay CSS/JS pre-computed at module load; only nonce + data attributes vary per request
- Info panel (History/Info/Activity) follows same pre-computed pattern as comment overlay
- Plan version snapshots stored with 90-day TTL
- `session_versions` table tracks per-push metadata (who pushed, when, which version)
- Old plan versions viewable at `/p/{id}?v=N`; version banner shown when viewing non-latest
