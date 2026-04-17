<!-- generated-by: gsd-doc-writer -->
# Development

## Local setup

Requirements: Node.js >= 20 (see `package.json` `engines`).

```bash
git clone https://github.com/Toprent-app/try-catch.git
cd try-catch
npm install
```

No `.env` file is required — the library has no runtime environment variables (see `docs/CONFIGURATION.md`).

### Git worktrees

Active feature branches live under `.worktrees/`. To work on a branch in isolation:

```bash
git worktree add .worktrees/my-feature origin/my-feature
cd .worktrees/my-feature
npm install
```

Each worktree shares the parent repo's `.git` directory but has its own working tree and `node_modules`.

## Build commands

| Command | Description |
|---|---|
| `npm run build` | Clean, typecheck, then compile CJS + ESM via tsup |
| `npm run build:watch` | tsup in watch mode — recompiles on file save |
| `npm run typecheck` | `tsc --noEmit` against `tsconfig.json` (CJS settings) |
| `npm run lint` | ESLint over `src/**/*.ts` using `typescript-eslint` |
| `npm run format` | Prettier — write changes in place |
| `npm run format:check` | Prettier — check only (used in CI) |
| `npm run test` | Vitest single run |
| `npm run test:watch` | Vitest interactive watch mode |
| `npm run clean` | Delete `dist/` |
| `npm run changeset` | Open a changeset entry for the next release |
| `npm run changeset:version` | Bump version from pending changesets |
| `npm run changeset:publish` | Publish to npm from bumped version |

The `prepublishOnly` script enforces `clean → lint → test → build` before any `npm publish`.

### Watch mode during development

```bash
npm run build:watch
```

tsup rebuilds both CJS (`dist/`) and ESM (`dist/esm/`) outputs on every save. Entry points are derived automatically from the `exports` field in `package.json` — no manual tsup entry list is needed.

## Directory layout

```
src/
  index.ts            # Framework-agnostic entry — exports Try and core types
  core/
    Try.ts            # Main Try class (lazy execution, sync + async)
    reporter.ts       # Reporter interface, ErrorReportConfig, NoopReporter
  adapters/
    browser/
      reporter.ts     # BrowserReporter — wraps @sentry/browser
    node/
      reporter.ts     # NodeReporter — wraps @sentry/node
  nextjs/
    index.ts          # Auto-registers SentryReporter for Next.js
    SentryReporter.ts # Next.js Sentry reporter
  browser/
    index.ts          # Auto-registers BrowserReporter
  node/
    index.ts          # Auto-registers NodeReporter
  utils/
    breadcrumbs.ts    # BreadcrumbExtractorUtil
    transformers.ts   # TransformerRegistry, PredefinedTransformers
    types.ts          # Shared types (BreadcrumbOptions, TryResult, ...)
  __tests__/
    Try.test.ts
    all-usecases.test.ts
    flexible-breadcrumbs.test.ts
    type-safety.test.ts
docs/
  ARCHITECTURE.md
  CONFIGURATION.md
  DEVELOPMENT.md
.planning/            # Phase planning context (not shipped)
  phases/
    01-core-try-semantics/
    ...
```

## Code style

**ESLint** (`eslint.config.mjs`) uses `typescript-eslint` recommended rules. Run:

```bash
npm run lint
```

**Prettier** (`prettier` in devDependencies) handles formatting. Run:

```bash
npm run format        # fix in place
npm run format:check  # check only
```

**TypeScript** strict mode is enabled (`strict: true`, `noImplicitAny: true`). Typecheck separately from the build:

```bash
npm run typecheck
```

## Adding a new reporter adapter

A reporter adapter connects the library to an error-tracking service. The contract is the `Reporter` interface in `src/core/reporter.ts`:

```typescript
export interface Reporter {
  report(error: Error, config: ErrorReportConfig): void;
  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void;
  createWrappedError(error: Error, message: string): Error;
}
```

Steps to add a new adapter (e.g., for Bugsnag):

1. Create `src/adapters/bugsnag/reporter.ts` implementing `Reporter`.
2. Create `src/bugsnag/index.ts` that instantiates the reporter and registers it (follow `src/node/index.ts` as a reference).
3. Add a `"./bugsnag"` entry to the `exports` field in `package.json` pointing to the new entry file. tsup will pick it up automatically from the `exports` field.
4. Add `@bugsnag/*` to the `external` list in `tsup.config.ts` under `sentryManual` (or use `peerDependencies`).
5. Add `"./bugsnag": ["dist/bugsnag/index.d.ts"]` to `typesVersions` in `package.json`.
6. Write tests in `src/__tests__/` covering the new adapter.

## Planning directory

`.planning/` contains phase context documents used during active feature development. These files are not published. Each phase directory holds a `CONTEXT.md` (gathered facts and decisions) and, once complete, a `SUMMARY.md` (outcome record). Do not delete them during rebases — they serve as a decision log.

## Branch conventions

No formal convention is documented. The main branch is `main`. Feature branches currently follow a descriptive slug pattern (e.g., `try-sync-returns`). Active branches are isolated via git worktrees under `.worktrees/`.

## PR process

- Open a pull request against `main`.
- The `prepublishOnly` gate (`lint → test → build`) must pass locally before pushing.
- No CI workflow file was detected in the repository — verification runs locally.
- Include a changeset entry (`npm run changeset`) if the change affects the public API or fixes a bug consumers would notice.
