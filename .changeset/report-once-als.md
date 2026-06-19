---
"@power-rent/try-catch": major
---

Report-once error aggregation via `AsyncLocalStorage` (Node and Next.js Node runtime).

Nested `Try` calls that wrap the same root failure now produce **exactly one
Sentry event**, assembled as a nested `cause` chain, instead of one event per
layer. The leaf preserves the innermost original error (and its own application
`cause` chain); only the failed function's stack is reported.

**Breaking changes (collector path — `/node` and `/nextjs` Node runtime only):**

- `.error()` and `.result()` now **report** when `.report()` was configured.
  They still return the error/result, but no longer suppress the Sentry report.
  The browser / bare-core / Next.js Edge legacy path is unchanged
  (`.error()`/`.result()` remain non-reporting there).
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

**Removed:** the deprecated, unexported `ErrorReporter` utility.
