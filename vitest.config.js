import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
    },
  },
});
