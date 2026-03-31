# PlanPush

[![Docker Image](https://img.shields.io/docker/v/frannsoftdev/planpush?label=Docker%20Hub&logo=docker&sort=semver)](https://hub.docker.com/r/frannsoftdev/planpush)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)

Self-hosted design doc server for [PlanPush](https://github.com/Frannsoft/planpush.plugins) — the Claude Code plugin that generates visual HTML design docs from planning sessions.

Your team runs `/planpush` in Claude Code, and the generated doc is pushed here. Team members open the private URL to view it, leave anchored comments, and get Slack notifications.

## Requirements

- A GitHub OAuth App
- A GitHub Organization (used for access control)

## Quick Start (Docker)

```bash
docker pull frannsoftdev/planpush:latest
```

1. **Create a GitHub OAuth App**

   Go to your org's GitHub settings → Developer settings → OAuth Apps → New OAuth App.

   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/auth/callback`

   Copy the Client ID and generate a Client Secret.

2. **Configure environment**

   Create a `.env` file:

   ```
   GITHUB_CLIENT_ID=<your client id>
   GITHUB_CLIENT_SECRET=<your client secret>
   GITHUB_ORG=<your github org>
   SECRET_KEY=<random string — run: openssl rand -hex 32>
   BASE_URL=http://localhost:3000
   ```

3. **Run**

   ```bash
   docker run -d \
     --name planpush \
     -p 3000:3000 \
     -v planpush-data:/app/data \
     --env-file .env \
     --restart unless-stopped \
     frannsoftdev/planpush:latest
   ```

   Or with Docker Compose — create a `docker-compose.yml`:

   ```yaml
   services:
     planpush:
       image: frannsoftdev/planpush:latest
       ports:
         - "3000:3000"
       volumes:
         - planpush-data:/app/data
       env_file:
         - .env
       restart: unless-stopped

   volumes:
     planpush-data:
   ```

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

## Updating

```bash
docker pull frannsoftdev/planpush:latest
docker compose up -d
```

Your data is preserved in the `planpush-data` volume.

## Deploying to Production

Set `BASE_URL` to your public URL (e.g., `https://planpush.example.com`) and update the GitHub OAuth App's callback URL to match.

For HTTPS, put a reverse proxy (nginx, Caddy, Traefik) in front of the server.

## Plugin Setup

Install the PlanPush plugin in Claude Code, then run:

```bash
# In Claude Code
/planpush:planpush
```

On first run, you'll be prompted for your server URL and guided through authentication automatically.

## License

AGPL-3.0-only
