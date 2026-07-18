---
"@power-rent/try-catch": major
---

Report-once error aggregation via `AsyncLocalStorage` (Node and Next.js Node runtime).

Nested `Try` calls that wrap the same root failure now produce **exactly one
Sentry event**, assembled as a nested `cause` chain, instead of one event per
layer. The leaf preserves the innermost original error (and its own application
`cause` chain); only the failed function's stack is reported.

**Breaking changes:**

- `.error()` and `.result()` now **report** when `.report()` was configured, on
  **every** platform — previously they reported only on the Node / Next.js
  collector path and were silent on the browser / bare-core / Edge legacy path.
  They still return the error/result. `.report()` alone decides *whether* an
  error is reported; the platform decides only once-vs-live and the terminal
  only the return shape.
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
- The Next.js entry installs the collector via a runtime-guarded dynamic import
  of `node:async_hooks`, so Edge/client bundles never reference it.

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

**Removed:** the deprecated, unexported `ErrorReporter` utility.
