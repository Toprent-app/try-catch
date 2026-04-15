# Phase 2: Reporting + Runtime Entry Points - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify and complete Sentry error reporting across node, browser, and Next.js entry points. Deliver non-Error normalization, resolve the Next.js double-breadcrumb bug, and ensure consistent breadcrumb recording behavior across all execution paths. Adapter tests are added as part of this phase.

Capabilities added in Phase 1 (core Try semantics, `.value()`, `.error()`, `.unwrap()`, `.default()`) are not in scope — this phase focuses on the reporting layer and entry point correctness.

</domain>

<decisions>
## Implementation Decisions

### Non-Error Normalization (DIAG-01)
- **D-01:** When a thrown value is not an `instanceof Error`, wrap it with `new Error('Non-Error thrown (<type>)')` where `<type>` is `typeof thrown` (e.g., `'Non-Error thrown (string)'`, `'Non-Error thrown (number)'`).
- **D-02:** Set `cause: thrown` on the wrapper Error to preserve the original value for inspection — consistent with the `Error cause` pattern already used throughout the codebase.
- **D-03:** Normalization happens in `execute()` at the catch-site — centralizes the fix and applies to both sync and async paths with a single change.
- **D-04:** If the thrown value is already `instanceof Error`, pass it through without wrapping.
- **D-05:** Add explicit tests covering thrown strings, numbers, and plain objects to verify normalization behavior.

### Breadcrumb Recording Consistency (SENT-03)
- **D-06:** Per SENT-03, breadcrumbs must always be recorded when `.breadcrumbs()` is configured, regardless of which execution method is called. Apply `addBreadcrumbsIfConfigured()` consistently across `value()`, `unwrap()`, `error()`, and `result()` — not just `value()` as currently implemented.

### Adapter Consistency Fix
- **D-07:** The Next.js `SentryReporter.report()` currently calls `addBreadcrumbs()` internally AND the Try class also calls it beforehand — causing breadcrumbs to be added twice in the Next.js environment. Remove the internal `addBreadcrumbs()` call from `SentryReporter.report()` so all adapters follow the same pattern: the Try class handles breadcrumb-adding, adapters only handle Sentry capture.

### Claude's Discretion
- Debug mode behavior: Keep the existing supplemental pattern — `.debug()` adds `console.error` logging alongside Sentry (not instead of it). No changes needed; the README examples and DIAG-02 requirement are satisfied by the existing implementation.
- Adapter test approach: Mock `@sentry/node`, `@sentry/browser`, and `@sentry/nextjs` in tests (using vitest's mock facilities); test that `captureException` and `addBreadcrumb` are called with correct arguments.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — All Phase 2 requirements: SENT-01 through SENT-04, ENTRY-01 through ENTRY-03, DIAG-01 through DIAG-02

### API Contract
- `README.md` — Breadcrumb examples and API docs; SENT-04 requires type-safe breadcrumbs config that matches these examples

### Core Implementation (modify these)
- `src/core/Try.ts` — `execute()` (normalization fix goes here), `reportError()`, `addBreadcrumbsIfConfigured()`, `value()`, `unwrap()`, `error()`, `result()`
- `src/core/reporter.ts` — Reporter interface definition

### Adapters (fix consistency, add tests)
- `src/adapters/browser/reporter.ts` — BrowserReporter
- `src/adapters/node/reporter.ts` — NodeReporter
- `src/nextjs/SentryReporter.ts` — Has the double-add bug (D-07)

### Entry Points (verify)
- `src/browser/index.ts` — Sets BrowserReporter as default
- `src/node/index.ts` — Sets NodeReporter as default
- `src/nextjs/index.ts` — Sets SentryReporter as default

### Codebase Context
- `.planning/codebase/CONCERNS.md` — Flags untested adapters and missing coverage config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NoopReporter` in `src/core/reporter.ts`: The noop pattern makes it easy to mock/stub reporters in tests
- `Try.setDefaultReporter()` / `Try.getDefaultReporter()`: Use these in tests to swap in a mock reporter and restore after
- `BreadcrumbExtractorUtil` in `src/utils/breadcrumbs.ts`: Already handles all breadcrumb formats; no changes needed

### Established Patterns
- Error wrapping: `new Error(message); wrapped.cause = original; wrapped.stack = original.stack` — already used in all reporters and `NoopReporter.createWrappedError()`
- Reporter injection: `Try.setDefaultReporter(reporter)` before each test, restore after
- Adapter structure: All adapters implement `report()`, `addBreadcrumbs()`, `createWrappedError()` — the interface is stable

### Integration Points
- Non-Error normalization: touches `execute()` in `src/core/Try.ts` (both the sync catch block and the async `.catch()` handler)
- Breadcrumb consistency: touches `unwrap()`, `error()`, and `result()` in `src/core/Try.ts` — add `addBreadcrumbsIfConfigured()` calls mirroring `value()`
- nextjs double-add fix: remove the internal `addBreadcrumbs()` call from `SentryReporter.report()` in `src/nextjs/SentryReporter.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for normalization message wording and test structure.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-reporting-runtime-entry-points*
*Context gathered: 2026-04-15*
