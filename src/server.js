import { app, kv } from './app.js';

const PORT = process.env.PORT || 3000;

// Clean up expired KV entries on startup
await kv.cleanup();

app.listen(PORT, () => {
  console.log(`[server] PlanPush Community listening on port ${PORT}`);
});
