import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Per D-05: vitest aliases map the package's public entry points to local
// `src/` so README / docs snippets can import from `@power-rent/try-catch[/sub]`
// and still execute against real source during the doctest harness.
// Order matters — sub-path aliases must be matched before the bare package
// alias, so we use an ordered array (not an object).
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@power-rent/try-catch/node',
        replacement: path.resolve(__dirname, 'src/node/index.ts'),
      },
      {
        find: '@power-rent/try-catch/browser',
        replacement: path.resolve(__dirname, 'src/browser/index.ts'),
      },
      {
        find: '@power-rent/try-catch/nextjs',
        replacement: path.resolve(__dirname, 'src/nextjs/index.ts'),
      },
      {
        find: '@power-rent/try-catch',
        replacement: path.resolve(__dirname, 'src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
