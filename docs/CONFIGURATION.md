<!-- generated-by: gsd-doc-writer -->
# Configuration

This document covers all configuration files used to build, lint, test, and publish `@power-rent/try-catch`.

## Environment Variables

The library itself ships no runtime environment-variable requirements. The single `process.env` reference in source code is a documentation example showing how callers might pass `process.env.NODE_ENV === 'development'` to `.debug()`. No variable is read at library initialisation time.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Optional | — | Not read by the library. Shown in docs as an example argument to `.debug()`. |

## Package Exports

`package.json` exposes four entry points via the `exports` field.

| Subpath | CJS (`require`) | ESM (`import`) | Types |
|---------|----------------|----------------|-------|
| `.` (default) | `dist/index.js` | `dist/esm/index.js` | `dist/index.d.ts` |
| `./nextjs` | `dist/nextjs/index.js` | `dist/esm/nextjs/index.js` | `dist/nextjs/index.d.ts` |
| `./node` | `dist/node/index.js` | `dist/esm/node/index.js` | `dist/node/index.d.ts` |
| `./browser` | `dist/browser/index.js` | `dist/esm/browser/index.js` | `dist/browser/index.d.ts` |

Legacy fields for bundlers that do not read `exports`:

| Field | Value |
|-------|-------|
| `main` | `dist/index.js` |
| `module` | `dist/esm/index.js` |
| `types` | `dist/index.d.ts` |

The `typesVersions` field mirrors the same four subpaths so older TypeScript resolvers find declaration files correctly.

The `nextjs`, `node`, and `browser` entry points are marked as `sideEffects` because they register platform-specific Sentry reporters at import time.

## Build Configuration (`tsup.config.ts`)

The build is driven by [tsup](https://tsup.egoist.dev/) and produces two output formats in a single run.

| Setting | Value |
|---------|-------|
| Tool | tsup 8.x (wraps esbuild) |
| Entry points | Derived dynamically from `package.json` `exports` field |
| CJS output directory | `dist/` |
| ESM output directory | `dist/esm/` |
| Target | `es2020` |
| Platform | `neutral` (compatible with Node, browser, and Next.js entries) |
| Sourcemaps | Enabled (sources embedded by esbuild) |
| Minification | Disabled |
| Code splitting | Disabled (one file per entry) |
| Output extension | `.js` for both formats (esbuild `outExtension` override) |
| Declaration types | Generated for CJS build only (`dts: true` with `resolve: true`) |
| External packages | All Sentry packages (`@sentry/core`, `@sentry/node`, `@sentry/browser`, `@sentry/nextjs`, `@sentry/tracing`, `@sentry/types`, `@sentry/utils`, `@sentry/react`, `@sentry/integrations`) plus any declared `peerDependencies` |

To trigger a full build:

```bash
npm run build
```

This runs `clean` → `typecheck` → `tsup`.

## TypeScript Configuration

Two tsconfig files govern the TypeScript compiler.

### `tsconfig.json` (CJS / type-checking)

| Option | Value |
|--------|-------|
| `target` | `ES2022` |
| `module` | `CommonJS` |
| `lib` | `["ES2022"]` |
| `outDir` | `dist` |
| `declaration` | `true` |
| `declarationMap` | `true` |
| `sourceMap` | `true` |
| `strict` | `true` |
| `noImplicitAny` | `true` |
| `esModuleInterop` | `true` |
| `allowSyntheticDefaultImports` | `true` |
| `forceConsistentCasingInFileNames` | `true` |
| `skipLibCheck` | `true` |
| `moduleResolution` | `node` |
| `include` | `src/**/*` |
| `exclude` | `node_modules`, `dist` |

This config is also used by the ESLint TypeScript parser (`parserOptions.project`).

### `tsconfig.esm.json` (ESM build)

Extends `tsconfig.json` with overrides:

| Option | Value |
|--------|-------|
| `module` | `ES2022` |
| `target` | `ES2020` |
| `outDir` | `dist/esm` |

## Lint Configuration (`eslint.config.mjs`)

Uses [typescript-eslint](https://typescript-eslint.io/) flat config.

| Setting | Value |
|---------|-------|
| Base config | `tseslint.configs.strictTypeChecked` |
| Parser project | `./tsconfig.json` |
| Ignored paths | `dist/**`, `node_modules/**`, `examples/**`, `eslint.config.mjs` |

Notable rule overrides (apply globally — main rules block has no `files` filter):

| Rule | Level | Reason |
|------|-------|--------|
| `@typescript-eslint/no-explicit-any` | `error` | |
| `@typescript-eslint/no-unsafe-argument` | `error` | |
| `@typescript-eslint/no-unsafe-assignment` | `error` | |
| `@typescript-eslint/no-unsafe-return` | `error` | |
| `@typescript-eslint/no-unsafe-call` | `error` | |
| `@typescript-eslint/no-unsafe-member-access` | `error` | |
| `@typescript-eslint/no-extraneous-class` | `off` | Static-only utility classes used as namespaces |
| `@typescript-eslint/no-unnecessary-type-parameters` | `off` | Nominal API clarity |
| `@typescript-eslint/unified-signatures` | `off` | Deliberate overload separation for IDE UX |
| `@typescript-eslint/restrict-template-expressions` | `error` (`allowNumber: true`) | |
| `@typescript-eslint/no-empty-object-type` | `off` | Sentinel use in tuple index types |
| `@typescript-eslint/no-unused-vars` | `error` (ignore `^_` prefix) | |

Test files (`src/__tests__/**`) relax all unsafe rules and several others to accommodate type-assertion-heavy tests.

To run the linter:

```bash
npm run lint
```

## Format Configuration (`.prettierrc`)

| Option | Value |
|--------|-------|
| `singleQuote` | `true` |
| `jsxSingleQuote` | `true` |
| `endOfLine` | `lf` |

Ignored by Prettier: `dist/`, `node_modules/`, all `*.md` files (`.prettierignore`).

```bash
npm run format        # write changes
npm run format:check  # check only (used in CI)
```

## Test Configuration (`vite.config.ts`)

Tests run with [Vitest](https://vitest.dev/).

| Setting | Value |
|---------|-------|
| Environment | `node` |
| Globals | Enabled (`globals: true`) |
| Coverage provider | `v8` |
| Coverage include | `src/**/*.ts` |
| `resolve.alias` | Maps `@power-rent/try-catch` and its `/node`, `/browser`, `/nextjs` subpaths to the corresponding entry under `src/` so docs/doctest snippets can `import` the package by its published name. Order matters — sub-path aliases are matched before the bare package alias. |

No coverage threshold is configured.

```bash
npm run test        # single run
npm run test:watch  # watch mode
```

## Dependency Update Configuration (`renovate.json`)

Renovate is configured with the `config:recommended` preset, which enables automatic dependency update PRs with grouping and scheduling defaults defined by that preset.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
```

## Runtime Requirement

```
node >= 20
```

Defined in `package.json` `engines.node`.
