# PlanPush

Self-hosted design doc collaboration server + Claude Code plugin.

## Project Structure

- `src/` — Express.js server (Node 22+, Knex.js for SQLite/PostgreSQL)
- `plugins/planpush/` — Claude Code plugin
- `.claude-plugin/marketplace.json` — marketplace manifest

## Plugin

Single command: `/planpush:planpush` — generates a visual HTML design doc and pushes it to the server. Authentication (RFC 8628 device flow) is handled inline on first run or when the refresh token expires.

Command source: `plugins/planpush/commands/planpush.md`
When updating, edit files in this repo — not the old `planpush.plugins` repo.

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

## Docker & CI

- Published to Docker Hub: `frannsoftdev/planpush`
- `.github/workflows/docker-publish.yml` — manual `workflow_dispatch` to build and push to Docker Hub
- `.github/workflows/auto-tag.yml` — on push to `main`, creates git tag `v{version}` from `package.json` if it doesn't exist
- Version lives in `package.json` — bump it in PRs, auto-tag on merge, then manually publish
- Docker tags: `frannsoftdev/planpush:{version}` + `frannsoftdev/planpush:latest`
- Single arch (linux/amd64) only
- GitHub secrets required: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

## Admin Features

- Soft-delete sessions (`deleted_at` column) — all session queries filter with `.whereNull('deleted_at')`
- User roles: `admin` / `member` — first user to sign in becomes admin
- `requireAdmin` middleware checks role from DB (not stale token data)
- User deactivation with KV-cached check (5min TTL) in `verifyRequest`
- Last-admin protection guards on role change and deactivation
- Token revocation (`revoked_at` on `api_tokens`)
- Audit log (`audit_log` table) — fire-and-forget writes via `setImmediate` in `src/utils/audit.js`

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
