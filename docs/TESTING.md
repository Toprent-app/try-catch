<!-- generated-by: gsd-doc-writer -->
# Testing

## Test framework and setup

The project uses **Vitest** (`^4.0.3`) as its test runner. No additional setup is required beyond installing dependencies.

```bash
npm install
```

Configuration is in `vite.config.ts`:

```ts
{
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
}
```

The `globals: true` setting makes `describe`, `it`, `expect`, and `vi` available without explicit imports (though test files in this project import them explicitly from `vitest`).

## Running tests

**Run the full test suite (one-shot):**

```bash
npm test
```

This runs `vitest run` — executes all tests and exits.

**Watch mode (re-runs on file change):**

```bash
npm run test:watch
```

This runs `vitest` without the `run` flag.

**Run a single file:**

```bash
npx vitest run src/__tests__/Try.test.ts
```

**Run with coverage:**

```bash
npx vitest run --coverage
```

Coverage is collected via the V8 provider and includes all files matching `src/**/*.ts`.

## Test file structure and naming conventions

All test files live under `src/__tests__/` and follow the `*.test.ts` naming pattern:

| File | What it covers |
|---|---|
| `src/__tests__/Try.test.ts` | Core behaviour — async and sync paths, error handling, Sentry reporting, breadcrumbs, tags, `finally`, `result()`, `default()`, exec-state sharing |
| `src/__tests__/all-usecases.test.ts` | Type-level and runtime surface — construction, result methods, `PromiseLike`/`await` behaviour, `.default()`, `.breadcrumbs()` overloads, chain methods, statics, `TryResult` narrowing |
| `src/__tests__/flexible-breadcrumbs.test.ts` | The full breadcrumb extraction API — key arrays, extractor objects, variadic transformers, object-syntax config, error handling, edge cases, caching |
| `src/__tests__/type-safety.test.ts` | TypeScript type assertions using `expectTypeOf` — value/error/unwrap return types, breadcrumb key validation, invalid argument rejection |
| `src/__tests__/adapters/node.test.ts` | `NodeReporter` adapter — Sentry `@sentry/node` mock-based assertions |
| `src/__tests__/adapters/browser.test.ts` | `BrowserReporter` adapter — Sentry `@sentry/browser` mock-based assertions |
| `src/__tests__/adapters/nextjs.test.ts` | `SentryReporter` (Next.js) adapter — Sentry `@sentry/nextjs` mock-based assertions |
| `src/__tests__/docs/doctest.test.ts` | Doctest harness — executes every ` ```ts doctest``` `-tagged snippet in `README.md`, `docs/*.md`, and `src/__tests__/docs/__fixtures__/*.md` with `NoopReporter` + mocked Sentry |
| `src/__tests__/docs/doctest-extract.test.ts` | Unit tests for the marker-based fenced-block extractor that feeds the doctest harness |

## Doc verification harness

The doctest harness (introduced in Phase 3 Wave 1) auto-executes TypeScript
snippets embedded in user-facing docs so examples cannot drift from real
behavior. Mark a fenced block with the ` ```ts doctest ` (or
` ```typescript doctest `) info string to opt it in:

````markdown
```ts doctest
import { Try } from '@power-rent/try-catch';
const value = await new Try(() => 42).value();
if (value !== 42) throw new Error('drift detected');
```
````

Scanned surface: `README.md`, every `docs/*.md`, and any `*.md` under
`src/__tests__/docs/__fixtures__/`. The runner sets `NoopReporter` as the
default reporter before each snippet (restored after), `vi.mock`s
`@sentry/node`, `@sentry/browser`, and `@sentry/nextjs`, and wires vitest
aliases so snippets can import from `@power-rent/try-catch[/sub]` as a real
consumer would. See `src/__tests__/docs/README.md` for the full marker
convention, execution contract, and checklist before adding a snippet.

## Writing new tests

Add a file to `src/__tests__/` with a `.test.ts` extension. Import helpers explicitly from `vitest`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
```

**Mocking Sentry** — tests that exercise `.report()`, `.breadcrumbs()`, or `.tag()` must mock the relevant Sentry package before importing `Try`. Declare the mock at the top of the file using `vi.mock`:

```ts
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
```

The same pattern applies for `@sentry/node` and `@sentry/browser` when testing those entry points.

**Resetting mocks between tests** — use `afterEach` to clear call history and restore spies:

```ts
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  Try.throwThroughErrorTypes([]); // reset static state if modified
});
```

**Spying on `console.error`** — tests that assert debug logging mock the method inline and restore it after:

```ts
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
// ... assertions ...
consoleSpy.mockRestore();
```

**Type assertions** — use `expectTypeOf` from `vitest` (imported explicitly) for compile-time type checks alongside runtime assertions. See `src/__tests__/type-safety.test.ts` and `src/__tests__/all-usecases.test.ts` for examples using `@ts-expect-error` to assert that invalid usages are rejected by the type system.

## Coverage requirements

No coverage thresholds are configured in `vite.config.ts`. The coverage section specifies the provider and included files only:

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
}
```

No minimum line, branch, function, or statement coverage is enforced.

## CI integration

Tests run in the **CI** workflow (`.github/workflows/ci.yml`) on every push and pull request to `main`.

| Step | Command |
|---|---|
| Type check | `npx tsc --noEmit` |
| Run tests | `npm run test` |

The workflow runs on `ubuntu-latest` with Node.js `20.x`. Tests must pass before a PR can be merged.
