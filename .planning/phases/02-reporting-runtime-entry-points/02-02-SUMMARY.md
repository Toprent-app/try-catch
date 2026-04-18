---
phase: 02-reporting-runtime-entry-points
plan: "02"
subsystem: reporting
tags: [sentry, nextjs, breadcrumbs, adapter]

requires:
  - phase: 01-core-try-semantics
    provides: Try class with reportError() and addBreadcrumbsIfConfigured()

provides:
  - SentryReporter.report() aligned with Node/Browser adapter contract (no internal addBreadcrumbs call)

affects:
  - 02-03 (adapter tests will assert no double-add via mocked Sentry)

tech-stack:
  added: []
  patterns:
    - "Adapters only handle Sentry capture — breadcrumb recording is owned by the Try class"

key-files:
  created: []
  modified:
    - src/nextjs/SentryReporter.ts

key-decisions:
  - "D-07: Remove internal addBreadcrumbs call from SentryReporter.report() — Try class handles breadcrumb recording via addBreadcrumbsIfConfigured(), adapters must not duplicate it"

patterns-established:
  - "Adapter report() contract: wrap error if message provided, captureException with library tag — no breadcrumb side-effects"

requirements-completed: [SENT-03]

duration: 3min
completed: "2026-04-18"
---

# Phase 2 Plan 02: SentryReporter Double-Add Fix Summary

**Removed internal `addBreadcrumbs` call from `SentryReporter.report()` so all three Sentry adapters follow identical contract: Try class owns breadcrumb recording, adapters only capture exceptions.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-18T02:22:00Z
- **Completed:** 2026-04-18T02:23:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed D-07 double-breadcrumb bug in Next.js environment: `SentryReporter.report()` no longer calls `this.addBreadcrumbs()` internally
- `SentryReporter.report()` is now structurally byte-equivalent to `NodeReporter.report()` and `BrowserReporter.report()`
- All three adapters now follow the same contract: `report()` wraps error if message provided and calls `captureException` with library tag — nothing else

## Task Commits

1. **Task 1: Remove internal addBreadcrumbs call from SentryReporter.report()** - `3be7d5b` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/nextjs/SentryReporter.ts` - Removed breadcrumb guard block (lines 13-19) and `this.addBreadcrumbs()` call from `report()`; public `addBreadcrumbs()` and `createWrappedError()` methods remain intact

## Decisions Made
None - followed plan as specified (D-07 fix was pre-decided in context).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 (adapter tests) can now assert `Sentry.addBreadcrumb` is NOT called from inside `SentryReporter.report()` — the mock will show 0 calls when `report()` is invoked directly without prior `addBreadcrumbsIfConfigured()`
- All three adapters present a uniform `report()` contract for Plan 03 to test against

## Self-Check

- [x] `grep -c "this.addBreadcrumbs" src/nextjs/SentryReporter.ts` = 0
- [x] `grep -n "addBreadcrumbs(" src/nextjs/SentryReporter.ts` = 1 match (method definition only)
- [x] `grep -c "Sentry.captureException" src/nextjs/SentryReporter.ts` = 1
- [x] `grep -c "config.breadcrumbData" src/nextjs/SentryReporter.ts` = 0
- [x] `npx tsc --noEmit` exits 0
- [x] `npx vitest run` 193/193 tests pass

## Self-Check: PASSED

---
*Phase: 02-reporting-runtime-entry-points*
*Completed: 2026-04-18*
