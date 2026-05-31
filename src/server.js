import { knex } from './db.js';
import { kv } from './kv.js';
import { hydrateSettingsIntoEnv } from './utils/settings.js';

// Importing './db.js' runs migrations at module load (top-level await), so the
// settings table exists by here. Load DB-backed settings into process.env
// BEFORE app.js is evaluated — app.js reads AUTH_PROVIDER, the provider
// credentials, BASE_URL, and session timeouts at module-load time. ENV WINS:
// explicit env vars are never overwritten.
await hydrateSettingsIntoEnv();

// Dynamic import so app.js module evaluation happens AFTER hydration above
// (static imports are hoisted and would run before any statement here).
const { app } = await import('./app.js');

const PORT = process.env.PORT || 3000;

// Clean up expired KV entries on startup
await kv.cleanup();

// Periodic KV cleanup (every 30 minutes)
const cleanupInterval = setInterval(() => kv.cleanup().catch(console.error), 30 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`[server] PlanPush listening on port ${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('[server] shutting down...');
  clearInterval(cleanupInterval);
  server.close(async () => {
    await knex.destroy();
    process.exit(0);
  });
  // Force exit after 10s if connections don't close (intentional, not a crash)
  setTimeout(() => process.exit(0), 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
