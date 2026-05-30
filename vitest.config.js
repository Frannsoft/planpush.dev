import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      lines: 65,
      functions: 60,
      branches: 60,
      statements: 65,
    },
  },
});
