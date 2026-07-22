import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'examples/**', 'eslint.config.mjs'] },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      // Library uses static-only utility classes (BreadcrumbExtractorUtil,
      // TransformerRegistry) as deliberate namespacing. Allow.
      '@typescript-eslint/no-extraneous-class': 'off',
      // Type parameters are used for nominal API clarity even when they appear
      // only once (e.g. generic forEach callbacks in utils).
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      // breadcrumbs() overloads are intentionally separate for better IDE
      // hover UX and DX, even when unifiable.
      '@typescript-eslint/unified-signatures': 'off',
      // paramN template literals in transformers legitimately embed numbers.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      // `{}` in types.ts is used as a "no extra fields" sentinel for
      // recursive tuple index types.
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow underscore-prefixed unused params (interface conformance
      // placeholders, e.g. NoopReporter).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Type-level tests intentionally reference unused params, await sync values to
      // assert types, and use permissive template expressions. Disable rules that
      // would produce noise in type-assertion-heavy test files.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
