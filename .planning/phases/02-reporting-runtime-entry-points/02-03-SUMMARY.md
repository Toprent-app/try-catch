---
phase: 02-reporting-runtime-entry-points
plan: "03"
subsystem: adapters/testing
tags: [sentry, adapters, tdd, coverage, node, browser, nextjs, regression-guard]
dependency_graph:
  requires:
    - "02-01: non-Error normalization + breadcrumb consistency in Try.ts"
    - "02-02: D-07 double-add fix in SentryReporter.report()"
  provides:
    - NodeReporter test coverage (5 tests)
    - BrowserReporter test coverage (5 tests)
    - SentryReporter test coverage + D-07 regression guard (6 tests)
  affects: []
tech_stack:
  added: []
  patterns:
    - "vi.mock() at file top before imports — Vitest hoisting pattern for Sentry package mocks"
    - "Adapter isolation: each test file mocks exactly one @sentry/* package"
    - "D-07 regression guard: expect(Sentry.addBreadcrumb).not.toHaveBeenCalled() after report()"
key_files:
  created:
    - src/__tests__/adapters/node.test.ts
    - src/__tests__/adapters/browser.test.ts
    - src/__tests__/adapters/nextjs.test.ts
  modified: []
decisions:
  - "Characterization test approach: adapters pre-exist; tests assert observed behavior rather than driving new code. TDD structure retained (discrete commit per file) per plan type."
  - "D-07 test positioned last in nextjs describe block as explicit regression guard for Plan 02 fix."
metrics:
  duration: "~10 minutes"
  completed: "2026-04-18"
  tasks: 4
  files_modified: 3
---

# Phase 02 Plan 03: Adapter Test Coverage Summary

Three adapter test files created under `src/__tests__/adapters/` — one per Sentry platform (node, browser, nextjs). Each mocks its `@sentry/*` package and asserts the exact call shapes for `captureException`, `addBreadcrumb`, and `createWrappedError`. The nextjs file adds a D-07 regression guard proving `SentryReporter.report()` no longer internally calls `addBreadcrumb`.

## What Was Built

**Task 1 — NodeReporter test (5 tests)**

`src/__tests__/adapters/node.test.ts` — mocks `@sentry/node`, tests:
- `report()` without message → original error passed to `captureException` with `library` tag
- `report()` with message → wrapped error with correct `message`, `cause`, `stack` passed to `captureException`
- `addBreadcrumbs()` with functionName → `Sentry.addBreadcrumb` called with `{ message: 'Calling X function', data }` shape
- `addBreadcrumbs()` without functionName → uses `'anonymous'`
- `createWrappedError()` → correct `message`, `cause`, `stack`

**Task 2 — BrowserReporter test (5 tests)**

`src/__tests__/adapters/browser.test.ts` — mirror of node test; mocks `@sentry/browser`, uses `BrowserReporter`. Identical assertions since both adapters share the same implementation shape.

**Task 3 — SentryReporter/nextjs test (6 tests)**

`src/__tests__/adapters/nextjs.test.ts` — mocks `@sentry/nextjs`, uses `SentryReporter`. Same 5 tests plus:
- **D-07 regression guard:** Calls `report()` with `breadcrumbData` and `functionName` in config → asserts `Sentry.addBreadcrumb` was NOT called (0 times). Proves Plan 02's fix is intact.

**Task 4 — Full suite verification**

`npx vitest run` → 222 tests pass across 7 test files. `npx tsc --noEmit` → 0 errors.

## Test Count Delta

| Phase | Tests |
|-------|-------|
| Pre-phase baseline (pre-02-01) | 193 |
| After 02-01 (normalization + breadcrumb consistency) | +13 = 206 |
| After 02-03 (adapter tests) | +16 = 222 |
| **Total delta** | **+29** |

## Files Created

| File | Lines | Tests |
|------|-------|-------|
| `src/__tests__/adapters/node.test.ts` | 69 | 5 |
| `src/__tests__/adapters/browser.test.ts` | 69 | 5 |
| `src/__tests__/adapters/nextjs.test.ts` | 81 | 6 |

## Commits

1. `64d3d97` — `test(02-03): add NodeReporter adapter tests (SENT-01, SENT-02, ENTRY-01)`
2. `ec5077f` — `test(02-03): add BrowserReporter adapter tests (SENT-01, SENT-02, ENTRY-02)`
3. `3addf86` — `test(02-03): add SentryReporter adapter tests + D-07 no-double-add assertion (SENT-01, SENT-02, SENT-03, ENTRY-03)`

## Requirements Closed

| Requirement | Closure |
|-------------|---------|
| SENT-01 | `captureException` called correctly in all 3 adapters |
| SENT-02 | Tags (`library` + user tags) and breadcrumbs asserted at adapter layer |
| ENTRY-01 | `src/node/index.ts` sets NodeReporter; tested via node.test.ts |
| ENTRY-02 | `src/browser/index.ts` sets BrowserReporter; tested via browser.test.ts |
| ENTRY-03 | `src/nextjs/index.ts` sets SentryReporter; tested via nextjs.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — test-only changes, no new network endpoints or auth paths.

## Self-Check

- [x] `src/__tests__/adapters/node.test.ts` exists (69 lines, 5 tests)
- [x] `src/__tests__/adapters/browser.test.ts` exists (69 lines, 5 tests)
- [x] `src/__tests__/adapters/nextjs.test.ts` exists (81 lines, 6 tests)
- [x] `grep -c "vi.mock('@sentry/node'" src/__tests__/adapters/node.test.ts` = 1
- [x] `grep -c "vi.mock('@sentry/browser'" src/__tests__/adapters/browser.test.ts` = 1
- [x] `grep -c "vi.mock('@sentry/nextjs'" src/__tests__/adapters/nextjs.test.ts` = 1
- [x] `grep -c "not.toHaveBeenCalled" src/__tests__/adapters/nextjs.test.ts` = 1 (D-07 guard)
- [x] `npx vitest run` exits 0 — 222 tests pass
- [x] `npx tsc --noEmit` exits 0

## Self-Check: PASSED
