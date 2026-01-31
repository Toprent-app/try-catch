---
phase: quick-001-type-safety-tests
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/__tests__/type-safety.test.ts
autonomous: true
must_haves:
  truths:
    - "Typecheck passes for README use-case typings (value/default/error/unwrap/report/breadcrumbs)"
    - "Invalid type usages in README scenarios are rejected via @ts-expect-error"
  artifacts:
    - path: "src/__tests__/type-safety.test.ts"
      provides: "Compile-time type assertions for README use cases"
  key_links:
    - from: "src/__tests__/type-safety.test.ts"
      to: "src/nextjs.ts (Try export)"
      via: "import Try from '../nextjs'"
      pattern: "import Try"
    - from: "src/__tests__/type-safety.test.ts"
      to: "TypeScript compiler"
      via: "@ts-expect-error assertions"
      pattern: "@ts-expect-error"
---

<objective>
Add type-safety tests that match README use cases.

Purpose: Prove the fluent Try API preserves types across common usage paths.
Output: A new type-focused test file that compiles and enforces invalid cases.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
@~/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@README.md
@src/__tests__/Try.test.ts
</context>

<tasks>

<task type="auto">
  <name>Add README-driven type-safety tests</name>
  <files>src/__tests__/type-safety.test.ts</files>
  <action>
Create a new vitest test file that encodes README use cases as type assertions:
- Import Try from '../nextjs' to match existing test pattern.
- Add cases for .value(), .default(), .error(), .unwrap(), .report() chaining with sync/async functions and mixed parameter types.
- Use expectTypeOf for positive assertions (e.g., default narrows return type; error is Error|undefined; unwrap is Awaited<T>).
- Use @ts-expect-error for invalid cases relevant to README (e.g., breadcrumbs keys not in object, wrong arg types).
- Keep runtime work minimal; tests should compile and run quickly.
Avoid: introducing new deps or changing existing APIs.
  </action>
  <verify>npm run typecheck && npm test</verify>
  <done>
Typecheck enforces README scenarios: valid cases compile, invalid cases fail only where @ts-expect-error is declared.
  </done>
</task>

</tasks>

<verification>
- npm run typecheck
- npm test
</verification>

<success_criteria>
- New type-safety test file exists and covers README use cases.
- Typecheck passes with enforced @ts-expect-error invalid cases.
</success_criteria>

<output>
After completion, create `.planning/quick/001-write-tests-that-verify-type-safety-acco/001-SUMMARY.md`
</output>
