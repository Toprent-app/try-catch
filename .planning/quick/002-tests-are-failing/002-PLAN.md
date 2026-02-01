---
phase: quick-002-tests-are-failing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/__tests__/type-safety.test.ts
  - src/core/Try.ts
  - src/utils/types.ts
  - src/utils/breadcrumbs.ts
  - src/utils/transformers.ts
autonomous: true
must_haves:
  truths:
    - "Typecheck passes for README type-safety scenarios"
    - "Breadcrumb typing rejects invalid keys and invalid argument types"
  artifacts:
    - path: src/__tests__/type-safety.test.ts
      provides: "Type-level expectations for Try"
    - path: src/utils/types.ts
      provides: "Breadcrumb typing helpers"
    - path: src/core/Try.ts
      provides: "Try API overloads for breadcrumbs/value/default"
  key_links:
    - from: src/core/Try.ts
      to: src/utils/types.ts
      via: "Breadcrumb type exports used in overloads"
      pattern: "BreadcrumbOptions|ValidateKeys|PositionalBreadcrumbs"
---

<objective>
Stabilize failing type checks by aligning Try typings with the new type-safety tests.

Purpose: Restore green typecheck so the new tests compile.
Output: Updated typing definitions and overloads that satisfy tests.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
@~/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/__tests__/type-safety.test.ts
@src/core/Try.ts
@src/utils/types.ts
</context>

<tasks>

<task type="auto">
  <name>Capture current typecheck failures</name>
  <files>none</files>
  <action>Run `npm run typecheck` and record the exact TypeScript errors and file paths (especially in type-safety tests and breadcrumb types).</action>
  <verify>`npm run typecheck` output captured</verify>
  <done>List of failing files + error codes ready to fix</done>
</task>

<task type="auto">
  <name>Fix breadcrumb and Try typings to satisfy tests</name>
  <files>
    src/core/Try.ts
    src/utils/types.ts
    src/__tests__/type-safety.test.ts
    src/utils/breadcrumbs.ts
    src/utils/transformers.ts
  </files>
  <action>
    Update typing utilities and Try overloads to match the test expectations:
    - Ensure `.breadcrumbs(['id'])` accepts key arrays only when the first argument is an object and rejects invalid keys.
    - Ensure positional and object breadcrumb configs preserve per-parameter typing (e.g., param 0 string, param 1 object keys, param 2 headers object).
    - Preserve invalid-case expectations in tests (`@ts-expect-error` lines should still fail).
    - Avoid loosening types to `any` or widening key validation; prefer stricter generic constraints.
  </action>
  <verify>TypeScript errors from Task 1 resolved without weakening type safety</verify>
  <done>All new type-safety tests compile with expected errors only</done>
</task>

<task type="auto">
  <name>Confirm typecheck passes</name>
  <files>none</files>
  <action>Re-run `npm run typecheck` to confirm zero errors.</action>
  <verify>`npm run typecheck` exits 0</verify>
  <done>Typecheck clean</done>
</task>

</tasks>

<verification>
- `npm run typecheck`
</verification>

<success_criteria>
- Typecheck passes with the new type-safety tests
- Breadcrumb typing is strict enough to catch invalid keys and argument types
</success_criteria>

<output>
After completion, create `.planning/quick/002-tests-are-failing/002-SUMMARY.md`
</output>
