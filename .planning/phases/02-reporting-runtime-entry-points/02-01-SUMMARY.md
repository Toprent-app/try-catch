---
phase: 02-reporting-runtime-entry-points
plan: "01"
subsystem: core
tags: [normalization, breadcrumbs, error-handling, try-semantics]
dependency_graph:
  requires: []
  provides: [non-error-normalization, breadcrumb-consistency]
  affects: [src/core/Try.ts]
tech_stack:
  added: []
  patterns: [TDD, static-helper, else-if-guard]
key_files:
  modified:
    - src/core/Try.ts
    - src/__tests__/Try.test.ts
decisions:
  - "normalizeThrown() static helper centralizes wrapping — single definition, two call sites"
  - "else if guard in unwrap() prevents double breadcrumb add when both .report() and .breadcrumbs() are chained"
  - "result() now materializes the execute() promise to inject breadcrumb side-effect in failure branch"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-18"
  tasks: 2
  files_modified: 2
---

# Phase 02 Plan 01: Core Try.ts Gaps Summary

Non-Error normalization at both catch sites in execute() plus breadcrumb recording consistency across all four terminal methods (value, unwrap, error, result).

## What Was Built

**Task 1 — Non-Error normalization (DIAG-01)**

Added `Try.normalizeThrown(e: unknown): Error` static private helper. Replaced `e as Error` casts at both catch sites in `execute()`:
- async `.catch((e: unknown) => { ... })` handler
- sync `catch (e) { ... }` block

Non-Error values (strings, numbers, plain objects) are wrapped as `new Error('Non-Error thrown (<typeof>)')` with `cause` set. Existing `Error` instances pass through unchanged. No `.stack` copy (non-Errors have no stack).

**Task 2 — Breadcrumb consistency (SENT-03)**

Applied `else if (this.config.breadcrumbConfig) { this.addBreadcrumbsIfConfigured(); }` to:
- `unwrap()` async branch — after `shouldCapture` / `reportError` block
- `unwrap()` sync branch — same
- `error()` async branch — failure path before return
- `error()` sync branch — failure path before return

Rewrote `result()` to materialize the `execute()` result and call `addBreadcrumbsIfConfigured()` in the failure path (both async and sync).

The `else if` guard in `unwrap()` and the `breadcrumbsAdded` flag in `addBreadcrumbsIfConfigured()` together prevent double-adds when `.report().breadcrumbs()` are both chained.

## Test Count Delta

- Before: 193 tests (across 4 test files)
- After: 206 tests (+13 new)
  - 6 normalization tests in `describe('non-Error normalization (DIAG-01)')`
  - 7 breadcrumb consistency tests in `describe('breadcrumb consistency (SENT-03, D-06)')`

## Files Modified

| File | Lines Before | Lines After | Delta |
|------|-------------|-------------|-------|
| src/core/Try.ts | ~930 | 947 | +17 |
| src/__tests__/Try.test.ts | ~1800 | 1937 | +137 |

## Deviations from Plan

None — plan executed exactly as written.

## Edge Cases Discovered

- `result()` previously delegated directly to `execute()` via a cast — adding breadcrumb side-effects required materializing the result first. The rewrite is structurally sound because `result()` already documented "never throws."
- The `breadcrumbsAdded` flag on the local instance (not static) means the flag resets correctly per Try instance — no cross-instance leakage.

## Independence Confirmation

Plan 02-02 (Next.js SentryReporter double-add fix) remains fully independent. The `SentryReporter.report()` internal `addBreadcrumbs` call is untouched in this plan. 02-02 removes that call.

## Self-Check

- [x] `src/core/Try.ts` exists and contains `normalizeThrown`
- [x] `src/__tests__/Try.test.ts` exists and contains both new describe blocks
- [x] All 206 tests pass: `npx vitest run` exits 0
- [x] `grep -n "e as Error" src/core/Try.ts` returns 0 matches
- [x] `grep -c "Non-Error thrown" src/core/Try.ts` returns 1
- [x] `grep -cE "if (this.config.breadcrumbConfig)" src/core/Try.ts` returns 6
- [x] `npx tsc --noEmit` exits 0

## Self-Check: PASSED
