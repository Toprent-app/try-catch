# Codebase Concerns

**Analysis Date:** 2026-01-30

## Tech Debt

**Missing Linting Configuration:**
- Issue: No ESLint setup, only Prettier for formatting.
- Files: `package.json` (scripts use prettier), entire `src/`
- Impact: Potential code style inconsistencies, missed errors.
- Fix approach: Install `@typescript-eslint/eslint-plugin` `@typescript-eslint/parser` `eslint`, add `eslint.config.js` with strict rules, integrate to pre-commit.

**Loose Typing in Breadcrumb Utilities:**
- Issue: `obj: any` and `keyof any` in extraction functions.
- Files: `src/utils/breadcrumbs.ts` (lines 69-70)
- Impact: Bypasses TypeScript strict checks, potential runtime issues.
- Fix approach: Change to `obj: Record<string, unknown>`, `keys: readonly string[]`; add type guards.

**No Test Coverage Reporting:**
- Issue: Vitest configured for coverage but missing provider (`@vitest/coverage-v8`).
- Files: `vite.config.ts` (coverage: {}), `package.json` (test script)
- Impact: Cannot enforce/track coverage thresholds.
- Fix approach: `npm i -D @vitest/coverage-v8@v4`, update `vite.config.ts` with `coverage.provider: 'v8'`, thresholds: { statements: 90, etc. }, add to CI.

**Oversized Example File:**
- Issue: Single massive demo file with console.logs.
- Files: `examples/comprehensive-examples.ts` (977 lines)
- Impact: Difficult to maintain/update examples.
- Fix approach: Split into `examples/basic.ts`, `advanced.ts`, `platform-specific.ts`; run via npm scripts.

**Monolithic Core Class:**
- Issue: All logic in one large file.
- Files: `src/core/Try.ts` (680 lines)
- Impact: Navigation and maintenance challenges.
- Fix approach: Extract private helpers (e.g., execute, reportError) to `src/core/helpers.ts`.

**Untested Adapters:**
- Issue: Platform adapters not unit-tested independently.
- Files: `src/adapters/node/reporter.ts`, `src/adapters/browser/reporter.ts`, `src/nextjs/SentryReporter.ts`
- Impact: Bugs in Sentry integration per platform undetected.
- Fix approach: Add `__tests__/adapters/node.test.ts` etc., mock Sentry per adapter.

## Known Bugs

None detected. All 71 tests pass (`src/__tests__/Try.test.ts`, `src/__tests__/flexible-breadcrumbs.test.ts`).

## Security Considerations

**Sentry Integration:**
- Risk: Peer dep on Sentry (@sentry/* ^8 <11), manual externals in tsup.
- Files: `tsup.config.ts`, `src/adapters/*`
- Current mitigation: Externals only, no bundling secrets.
- Recommendations: Audit deps regularly (renovate active), add `npm audit` to CI.

No eval/unsafe code, no secrets in repo.

## Performance Bottlenecks

None identified. Library operations are lightweight (async wrappers).

## Fragile Areas

**Breadcrumb Generics:**
- Files: `src/core/Try.ts` (lines 221-249), `src/utils/breadcrumbs.ts`
- Why fragile: Complex overloads for variadic transformers/objects/arrays.
- Safe modification: Update tests first (`src/__tests__/flexible-breadcrumbs.test.ts`).
- Test coverage: Good (22 tests), but add property-based tests.

**Tsup Build Config:**
- Files: `tsup.config.ts` (reads package.json exports)
- Why fragile: Dynamic entry derivation.
- Safe modification: Test build outputs match (`npm run build && npm run typecheck`).

## Scaling Limits

N/A - Client-side library.

## Dependencies at Risk

None. Dev deps recent (vitest 4.0.3, tsup 8.5.0, TS 5.9.3). Renovate PRs pending (node, prettier, etc.).

## Missing Critical Features

**CI Coverage Upload:**
- Problem: Tests run in GitHub Actions but no coverage upload.
- Blocks: Monitoring coverage trends.
- Files: `.github/workflows/ci.yml`

## Test Coverage Gaps

**Adapter Integration:**
- What's not tested: Real Sentry calls in node/browser/nextjs.
- Files: `src/adapters/*`, `src/nextjs/*`
- Risk: Platform differences break unnoticed.
- Priority: Medium

**Utils Edge Cases:**
- What's not tested: Error-prone transformers.
- Files: `src/utils/transformers.ts`
- Risk: Breadcrumb corruption.
- Priority: Low

---

*Concerns audit: 2026-01-30*