---
phase: quick-002-tests-are-failing
plan: 01
subsystem: testing
tags: [typescript, typing, try, breadcrumbs]

# Dependency graph
requires:
  - phase: quick-001-type-safety-tests
    provides: type-safety tests for Try README scenarios
provides:
  - async/sync return typing aligned with Try API usage
  - non-distributive promise detection for never-returning functions
affects: [core-try-semantics, type-safety]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - non-distributive conditional types for promise detection

key-files:
  created: []
  modified:
    - src/core/Try.ts

key-decisions:
  - "Use return-type generic (TReturn) to preserve async vs sync inference"
  - "Treat never as non-promise in IfPromise to avoid type collapse"

patterns-established:
  - "Promise detection uses non-distributive conditional types"

# Metrics
duration: 5m 38s
completed: 2026-02-01
---

# Phase quick-002-tests-are-failing Plan 01 Summary

**Try method return typing now preserves async/sync inference with stable promise narrowing**

## Performance

- **Duration:** 5m 38s
- **Started:** 2026-02-01T06:30:58Z
- **Completed:** 2026-02-01T06:36:36Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Aligned Try return typing with async and sync functions
- Stabilized promise detection for never-returning functions
- Restored clean typecheck for type-safety tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture current typecheck failures** - no commit (no file changes)
2. **Task 2: Fix breadcrumb and Try typings to satisfy tests** - `793eed1` (fix)
3. **Task 3: Confirm typecheck passes** - no commit (no file changes)

**Plan metadata:** pending (docs commit follows)

## Files Created/Modified
- `src/core/Try.ts` - adjust generics and promise-aware return typing

## Decisions Made
- Use return-type generics to detect async functions
- Treat never as non-promise in IfPromise to avoid `never` collapse

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Typecheck failures from async/sync inference and `never` handling; resolved in Try typings

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Typecheck green with strict breadcrumb and return typing
- Ready for additional core Try semantics work

---
*Phase: quick-002-tests-are-failing*
*Completed: 2026-02-01*
