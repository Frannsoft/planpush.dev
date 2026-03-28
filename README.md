# PlanPush Community Edition

Self-hosted design doc server for [PlanPush](https://github.com/Frannsoft/planpush.plugins) — the Claude Code plugin that generates visual HTML design docs from planning sessions.

Your team runs `/planpush` in Claude Code, and the generated doc is pushed here. Team members open the private URL to view it, leave anchored comments, and get Slack notifications.

## Requirements

- Node.js 22+ (or Docker)
- A GitHub OAuth App
- A GitHub Organization (used for access control)

## Quick Start (Docker)

1. **Create a GitHub OAuth App**

   Go to your org's GitHub settings → Developer settings → OAuth Apps → New OAuth App.

   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/auth/callback`

   Copy the Client ID and generate a Client Secret.

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:

   ```
   GITHUB_CLIENT_ID=<your client id>
   GITHUB_CLIENT_SECRET=<your client secret>
   GITHUB_ORG=<your github org>
   SECRET_KEY=<random string — run: openssl rand -hex 32>
   BASE_URL=http://localhost:3000
   ```

3. **Run**

   ```bash
   docker compose up -d
   ```

   The server is now running at `http://localhost:3000`.

## Quick Start (Node.js)

```bash
npm install
cp .env.example .env
# Edit .env with your values (see Docker section above)
node src/server.js
```

## How It Works

1. Developer runs `/planpush` in Claude Code during a planning session
2. Claude generates a visual HTML design doc from the conversation
3. The HTML is pushed to this server via `POST /api/push`
4. Team opens the private URL — sees the live design doc, leaves anchored comments
5. Slack gets notified (optional)

## Authentication

- **Web:** GitHub OAuth — only members of your configured `GITHUB_ORG` can sign in
- **CLI:** RFC 8628 device authorization flow — same GitHub OAuth, same org check

The first user to sign in becomes the admin. All subsequent users get the member role.

## Slack (Optional)

Set `SLACK_WEBHOOK_URL` in `.env` to enable notifications for:
- New comments
- Plan updates
- Comment resolutions

## Data

All data is stored locally:
- **SQLite database:** `data/planpush.db`
- **HTML snapshots:** `data/kv/`

Back up the `data/` directory to preserve everything.

## Deploying to Production

Set `BASE_URL` to your public URL (e.g., `https://planpush.example.com`) and update the GitHub OAuth App's callback URL to match.

For HTTPS, put a reverse proxy (nginx, Caddy, Traefik) in front of the server.

## Plugin Setup

Install the PlanPush plugin in Claude Code, then configure it to point at your server:

```bash
# In Claude Code
/planpush:planpush-auth
```

When prompted, enter your server URL (e.g., `http://localhost:3000`).

## License

MIT
