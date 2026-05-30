import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    isolate: true,
    // Never discover tests inside auto-pickup git worktrees (.claude/worktrees/*),
    // or a leftover worktree copy double-runs the suite and breaks the coverage gate.
    exclude: [...configDefaults.exclude, '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['.claude/**'],
      lines: 65,
      functions: 60,
      branches: 60,
      statements: 65,
    },
  },
});
