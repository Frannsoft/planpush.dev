import { app, kv } from './app.js';
import { knex } from './db.js';

const PORT = process.env.PORT || 3000;

// Clean up expired KV entries on startup
await kv.cleanup();

// Periodic KV cleanup (every 30 minutes)
const cleanupInterval = setInterval(() => kv.cleanup().catch(console.error), 30 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`[server] PlanPush Community listening on port ${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('[server] shutting down...');
  clearInterval(cleanupInterval);
  server.close(async () => {
    await knex.destroy();
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
