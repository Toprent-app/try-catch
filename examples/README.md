# Examples

Two runnable TypeScript files plus a dedicated tsconfig that type-checks them against the local `src/`.

## Files

### `comprehensive-examples.ts`

A curated tour of the current `@power-rent/try-catch` API. It exercises every method on the `Try` class — `.value()`, `.unwrap()`, `.error()`, `.result()`, `.default()`, `.finally()`, `.debug()`, `.report()`, `.breadcrumbs()` (all four variants: key arrays, variadic transformers, index-keyed object, extractor objects), `.tag()`, `.tags()`, `Try.setDefaultReporter`, `Try.throwThroughErrorTypes` — plus the non-Error normalization contract and the breadcrumbs-on-every-terminal guarantee. Organized into labeled sections that mirror the README API tour.

### `custom-reporter.ts`

A minimal implementation of the current three-method `Reporter` interface (`report`, `addBreadcrumbs`, `createWrappedError`). The `ConsoleReporter` class it defines is the same contract every bundled adapter (`src/adapters/node`, `src/adapters/browser`, `src/nextjs/SentryReporter`) follows. Use it as a starting point for wiring Datadog, Honeycomb, an in-memory test collector, or any other backend.

## Running the examples

No TypeScript runner is pinned as a dev-dependency in this repo. Install one locally to execute the files directly:

```bash
npm install -D tsx
npx tsx examples/comprehensive-examples.ts
npx tsx examples/custom-reporter.ts
```

The default reporter registered in `comprehensive-examples.ts` is `NoopReporter`, so running it produces no side effects beyond its own `console.log` calls. Swap in `ConsoleReporter` from `custom-reporter.ts` (or your own `Reporter`) to see reports flow end-to-end.

## Type-checking these examples

The examples have their own tsconfig so they can be verified independently of the package build:

```bash
npx tsc -p examples
```

`examples/tsconfig.json` extends the project tsconfig, sets `noEmit: true`, and uses `paths` to resolve `@power-rent/try-catch` and its `/node`, `/browser`, `/nextjs` sub-paths to the local `src/` tree. That means examples import from the exact package name a consumer would use in application code (D-12) while still being fully type-checked against the current source (D-11).

The root `npx tsc --noEmit` only covers `src/**/*` (see `tsconfig.json`), so use `npx tsc -p examples` to verify changes to this directory.

## See also

- [../README.md](../README.md) — API tour and library overview
- [../docs/GETTING-STARTED.md](../docs/GETTING-STARTED.md) — choosing the right entry point (`@power-rent/try-catch` vs `/node`, `/browser`, `/nextjs`)
