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

- Uses **Knex.js** with a D1-compatible adapter shim (`.prepare().bind().first()/all()/run()`)
- Default: SQLite via `better-sqlite3` (zero-config)
- PostgreSQL: set `DATABASE_URL=postgres://...` in `.env`
- KV store is database-backed (`kv_store` table), not filesystem
- Migrations: JS files in `src/migrations/`, auto-run at startup via `knex.migrate.latest()`
- `normalizeSql()` in `db.js` auto-translates `datetime('now')` → `NOW()` for PG
- `extractRows()` in `db.js` handles different `knex.raw()` result shapes per dialect

## Key Patterns

- Auth: GitHub OAuth (web) + RFC 8628 device flow (CLI)
- HTML sanitization via cheerio (no inline scripts allowed in pushed docs)
- CSP with nonces for all inline scripts
- Plan CSS/JS injected server-side, not authored by users
