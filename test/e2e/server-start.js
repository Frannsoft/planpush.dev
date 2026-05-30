import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Redirect to the actual server
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../');
const srcDir = join(projectRoot, 'src');

// Ensure DATA_DIR exists before importing db
const DATA_DIR = process.env.DATA_DIR || './data';
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Import after env vars are set
import { knex } from '../../src/db.js';
import { app } from '../../src/app.js';
import { kv } from '../../src/kv.js';
import { seedUser, seedSession, resetDb } from '../../test/helpers/db.js';
import { createHmac } from 'crypto';
import { randomBytes } from 'crypto';

const PORT = process.env.PORT || 3000;

// Main startup
async function start() {
  try {
    console.log('[e2e-server] Starting...');

    // Reset database for clean test state
    await resetDb();
    console.log('[e2e-server] Database reset');

    // Seed test users and sessions
    const adminUser = await seedUser({ role: 'admin' });
    const memberUser = await seedUser({ role: 'developer' });
    const privateViewerUser = await seedUser({ role: 'developer' });

    console.log('[e2e-server] Seeded users:', {
      admin: adminUser.id,
      member: memberUser.id,
      privateViewer: privateViewerUser.id,
    });

    // Create a published session (for journey 2, 3)
    const publishedSession = await seedSession({
      created_by: memberUser.id,
      published_at: new Date().toISOString(),
      title: 'Published Test Plan',
    });

    console.log('[e2e-server] Seeded published session:', publishedSession.id);

    // Store a simple HTML plan for the viewer test
    const testHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Plan</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Test Plan</h1>
  <p>This is a test design doc for E2E testing.</p>
  <button id="test-button">Test Button</button>
  <script>
    console.log('plan.js loaded successfully');
    document.getElementById('test-button').addEventListener('click', () => {
      console.log('button clicked');
    });
  </script>
</body>
</html>`;

    await kv.put(`plan:${publishedSession.id}:current`, testHtml);
    console.log('[e2e-server] Stored test plan HTML');

    // Create a private session
    const privateSession = await seedSession({
      created_by: privateViewerUser.id,
      published_at: null, // Private
      title: 'Private Test Plan',
    });

    console.log('[e2e-server] Seeded private session:', privateSession.id);
    await kv.put(`plan:${privateSession.id}:current`, testHtml);

    // Store credentials for tests to use
    await kv.put(
      'e2e:test-credentials',
      JSON.stringify({
        admin: {
          id: adminUser.id,
          displayName: adminUser.display_name,
        },
        member: {
          id: memberUser.id,
          displayName: memberUser.display_name,
        },
        privateViewer: {
          id: privateViewerUser.id,
          displayName: privateViewerUser.display_name,
        },
        publishedSessionId: publishedSession.id,
        privateSessionId: privateSession.id,
      })
    );

    console.log('[e2e-server] Stored test credentials in KV');

    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`[e2e-server] PlanPush listening on port ${PORT}`);
    });

    // Graceful shutdown
    async function shutdown() {
      console.log('[e2e-server] shutting down...');
      server.close(async () => {
        await knex.destroy();
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 10000);
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('[e2e-server] startup error:', err);
    process.exit(1);
  }
}

start();
