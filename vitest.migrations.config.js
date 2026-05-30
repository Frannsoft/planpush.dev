import { defineConfig } from 'vitest/config';

// Dedicated config for the real-Postgres migration-parity test.
// Run via `npm run test:migrations:pg`. Intentionally separate from the default
// config: no setup.js (which forces NODE_ENV=test → SQLite), and generous
// timeouts to cover container pull/startup.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/migrations/**/*.test.js'],
    testTimeout: 120000,
    hookTimeout: 180000,
  },
});
