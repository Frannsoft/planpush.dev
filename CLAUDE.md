# PlanPush

Self-hosted design doc collaboration server + Claude Code plugin.

## Project Structure

- `src/` — Express.js server (Node 22+, Knex.js for SQLite/PostgreSQL)
- `plugins/planpush/` — Claude Code plugin
- `.claude-plugin/marketplace.json` — marketplace manifest
- `plugins/planpush/.claude-plugin/plugin.json` — plugin version (must stay in sync with marketplace.json)

## Plugin

Single command: `/planpush:planpush` — generates a visual HTML design doc and pushes it to the server. Authentication (RFC 8628 device flow) is handled inline on first run or when the refresh token expires.

Command source: `plugins/planpush/commands/planpush.md`
When updating, edit files in this repo — not the old `planpush.plugins` repo.

Plugin flow:
1. Authenticate (device flow → refresh token → access token)
2. Resolve output directory and session name (supports `name:` prefix in args, prompts user on first push)
3. Generate HTML design doc from conversation context
4. Push to server with `X-Session-Name` header (first push) or `X-Session-Id` header (subsequent push)
5. Save session ID locally for subsequent pushes

Version bumps: when modifying plugin commands, bump version in **all three** places:
- `.claude-plugin/marketplace.json` → `metadata.version` and `plugins[].version`
- `plugins/planpush/.claude-plugin/plugin.json` → `version`

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

## Routes

- `GET /` → redirects to `/dashboard`
- `GET /auth/login` → GitHub OAuth login
- `GET /auth/callback` → OAuth callback (creates/upserts user, sets session cookie)
- `GET /api/auth/device` → device flow: returns device_code + user_code
- `POST /api/auth/device/token` → device flow: polls for authorization, returns refresh_token
- `POST /api/auth/token` → exchange refresh token for access token
- `GET /activate` / `POST /activate` → device code activation page
- `POST /api/push` → push HTML doc (accepts `X-Session-Name` for named URLs, `X-Session-Id` for updates)
- `GET /p/:sessionId` → view a plan (supports `?v=N` for old versions)
- `GET /dashboard` → user dashboard
- `GET /health` → health check

## Session IDs

Session IDs double as URL slugs. Two formats:
- **Named** (preferred): slug-style from `X-Session-Name` header (e.g. `auth-redesign` → `/p/auth-redesign`)
- **Legacy**: auto-generated `sess_` + 12 hex chars (e.g. `sess_064d4a62049b`)

Validation regex: `/^(sess_[0-9a-f]{12}|[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)$/`
Name collisions return HTTP 409.

## Key Patterns

- Auth: GitHub OAuth (web) + RFC 8628 device flow (CLI)
- Device flow requires web login first — `handleAuthDeviceToken` returns a helpful error with login URL if user not found
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
