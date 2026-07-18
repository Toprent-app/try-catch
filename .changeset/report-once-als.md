---
"@power-rent/try-catch": major
---

Report-once error aggregation via `AsyncLocalStorage` (Node and Next.js Node runtime).

Nested `Try` calls that wrap the same root failure now produce **exactly one
Sentry event**, assembled as a nested `cause` chain, instead of one event per
layer. The leaf preserves the innermost original error (and its own application
`cause` chain); only the failed function's stack is reported.

**Breaking changes:**

- `.error()` and `.result()` now **honor a configured `.report()`**. Previously
  these two terminals ignored `.report()` and never sent to Sentry; now they
  report **only when `.report()` is in the chain** — matching `.value()` /
  `.unwrap()` — while still returning the error/result. Without `.report()` they
  never report. Reporting is gated solely by `.report()`; the platform decides
  only once-vs-live (Node / Next.js Node collector path: the boundary's single
  aggregated event; browser / bare-core / Edge legacy path: this layer's error
  reported directly), and the terminal decides only the return shape.
- The Next.js entry now **forces** its `@sentry/nextjs` reporter as the default
  (load-order-independent) instead of first-wins, so a transitively-loaded
  `/node` entry can no longer win and route a Next.js app's events to an
  uninitialized `@sentry/node`. A pure-Node app that transitively imports
  `/nextjs` should set its reporter explicitly via `Try.setDefaultReporter`.
- Breadcrumbs on the collector path are attached to the single assembled event
  via an isolated Sentry scope, instead of being added to the global Sentry
  breadcrumb trail.

**Additions:**

- `Try.setScopeProvider()` / `Try.getScopeProvider()` and a process-wide registry
  so multiple server entries in one realm share a single scope.
- Optional `Reporter.capture(assembledError, { tags, breadcrumbs })` for
  collector-path emit; reporters without it fall back to per-root `report()`.
- `Try.scope(fn)`: runs `fn` inside a single fresh aggregation scope so
  *sibling* top-level `Try`s (not just nested ones) collect into one boundary
  that flushes exactly once when `fn` settles. Result/error pass through; on
  the legacy provider it simply runs `fn`.
- The Next.js entry installs the collector **synchronously** at module
  evaluation via `process.getBuiltinModule('node:async_hooks')` (closing the
  cold-start race where a `Try` in the load tick double-reported), falling back
  to the runtime-guarded dynamic import on Node without `getBuiltinModule`.
  Edge/client bundles still never reference `node:` modules.

**Hardening:**

- A report-once scope caps buffered errors and overflow-flushes in batches, so a
  long-lived boundary cannot grow the buffer unbounded or lose every buffered
  error if the process dies before the boundary settles.
- The shared registry symbol is versioned and reads are defensive, so a skewed
  cross-version install cannot throw out of a never-throw terminal.
- A custom `ScopeProvider` that throws falls back to the legacy path instead of
  breaking the never-throw contract.
- Errors with hostile `stack`/`cause` getters can no longer break a terminal or
  poison the scope buffer: flush assembly reads defensively and the buffer is
  always cleared, so one malformed group cannot block the others.
- `throw null` (or any non-object throw) with `.report().unwrap()` now throws
  the wrapped error instead of a library `TypeError`.
- A callback scheduled inside a boundary that fires after that boundary flushed
  now opens a fresh boundary (dead scopes no longer disable aggregation).
- A structurally-valid async `Reporter.capture()`/`report()` that rejects is
  caught during flush instead of surfacing as an `unhandledRejection`.
- An object root whose entries span an overflow flush now emits exactly once:
  emitted object roots are tracked per scope and skipped by later batches.
  Primitive roots are never tracked (they carry no identity and never merge).

**Known limitations (documented):** `TryResult.error` is typed `Error` but
non-`Error` throws pass through unchanged (`.error()` can return
`null`/`undefined`; type fix deferred to a major), and two distinct primitive
throws (`throw 'x'`) re-thrown across layers cannot be merged — primitives have
no identity, so merging by value would wrongly merge independent failures.

**Removed:** the deprecated, unexported `ErrorReporter` utility.
