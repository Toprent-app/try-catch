import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the real source tree. The repo hosts stray git worktrees under
    // `.worktrees/` and `.claude/worktrees/` whose duplicate *.test.ts files
    // would otherwise be globbed by vitest's defaults and pollute the run.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
