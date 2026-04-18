---
phase: 3
plan: "03-01"
subsystem: docs-harness
tags: [dx, testing, vitest, docs]
dependency_graph:
  requires:
    - src/core/Try.ts
    - src/core/reporter.ts (NoopReporter)
    - src/{index,node/index,browser/index,nextjs/index}.ts
  provides:
    - src/__tests__/docs/doctest-extract.ts::extractDoctests
    - src/__tests__/docs/doctest.test.ts (DX-01 harness)
    - vitest aliases for @power-rent/try-catch[/sub]
  affects:
    - vite.config.ts
tech_stack:
  added: []
  patterns:
    - marker-tagged fenced block extraction
    - vitest resolve.alias for package-name imports
    - temp-file + dynamic import() for snippet execution
    - vi.mock at module scope for @sentry/* isolation
key_files:
  created:
    - src/__tests__/docs/doctest-extract.ts
    - src/__tests__/docs/doctest-extract.test.ts
    - src/__tests__/docs/doctest.test.ts
    - src/__tests__/docs/README.md
    - src/__tests__/docs/__fixtures__/seed-snippet.md
  modified:
    - vite.config.ts
decisions:
  - id: D-04-marker
    choice: "```ts doctest``` (ts|typescript + doctest token)"
  - id: D-05-alias-order
    choice: "ordered-array aliases so /node /browser /nextjs match before bare @power-rent/try-catch"
  - id: alias-smoke
    choice: "config-level assertion (not dynamic import) — dynamic import would hit dist/ via Node resolution"
  - id: tsc-compat
    choice: "harness uses relative import for Try/NoopReporter to keep tsc --noEmit green without touching tsconfig paths"
metrics:
  duration_seconds: 443
  completed_date: 2026-04-18
  commits: 6
  tests_added: 12
  tests_total: 234
---

# Phase 3 Plan 01: Doctest Harness (DX-01) Summary

**One-liner:** Vitest-based doctest harness that extracts `` ```ts doctest `` fenced blocks from README.md + docs/*.md + fixtures and executes them against local src via vitest aliases with NoopReporter and @sentry/* mocked.

## What Shipped

1. **Marker convention (D-04).** `` ```ts doctest `` — info string begins with `ts` or `typescript` and contains `doctest` as a whitespace-separated token. Every other fenced block is skipped silently. Unterminated tagged fences throw with a line number.
2. **Extractor.** `extractDoctests(source) => { code, index, startLine }[]` — 87-line line-walker, no markdown parser dependency, reusable by Wave 2 plans. 9 unit tests covering happy path, typescript alias, untagged `ts`/`typescript`, bash skip, multi-block ordering, unterminated fence, non-ts languages, and substring-vs-token check.
3. **Vitest aliases (D-05).** Ordered array in `vite.config.ts` mapping the four package export paths to `src/{index,node/index,browser/index,nextjs/index}.ts`. Sub-path aliases precede the bare alias so they match first.
4. **Harness suite.** `src/__tests__/docs/doctest.test.ts` globs README.md + every `docs/*.md` + every `__fixtures__/*.md`, emits one `describe` per file, one `it.each` case per snippet labelled by start line. Before each case: `Try.setDefaultReporter(new NoopReporter())`; restore after. `@sentry/node`, `@sentry/browser`, `@sentry/nextjs` are `vi.mock`-ed at module scope.
5. **Zero-snippet guard.** If `totalBlocks === 0` across the entire tracked surface, the suite throws: "No doctest snippets found — DX-01 harness requires at least one tagged snippet." No silent-pass branch.
6. **Seed fixture.** `__fixtures__/seed-snippet.md` contains one `Try(() => 40 + 2).value()` snippet so Wave 1 CI executes something end-to-end before Wave 2 tags real docs.
7. **Snippet execution.** Each snippet is written to a UUID-named temp file under `node_modules/.doctest/` and dynamically imported (vitest's transformer handles `.ts`). Failures are re-thrown with `file:line` origin prefixed.
8. **Contributor README.** `src/__tests__/docs/README.md` — ~60-line reference for marker, execution contract, tracked surface, skip semantics, and how to add/remove snippets.

## Testing Substrate Contract (inherited by 03-02 / 03-03)

- **Marker:** `` ```ts doctest ``
- **Imports:** always `@power-rent/try-catch[/node|/browser|/nextjs]` — never relative `../src/...`
- **Reporter:** NoopReporter is the default in each case
- **Sentry:** all three `@sentry/*` packages mocked (captureException + addBreadcrumb stubs)
- **Assertions:** inline `if (...) throw new Error(...)`
- **Tracked surface:** README.md + docs/*.md + src/\_\_tests\_\_/docs/\_\_fixtures\_\_/*.md

## Verification

- `npx vitest run` — 234/234 pass (222 pre-existing + 12 new).
- `npm run typecheck` — clean.
- `npm run lint` — only pre-existing errors in `src/__tests__/Try.test.ts` (logged to `deferred-items.md`); no new lint debt.
- Alias smoke: `vite.config`'s `resolve.alias` asserts contain all four finds, all replacements resolve under `src/` (not `dist/`).
- Zero-snippet guard: dry-run mental check — removing `seed-snippet.md` leaves 0 tagged blocks across the surface, tripping the "No doctest snippets found" throw.
- No real Sentry calls: three `@sentry/*` packages mocked at module scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `--reporter=basic` not valid in vitest 4.x**
- **Found during:** Task 1 verification.
- **Issue:** The plan's verify command `npx vitest run --reporter=basic` fails — vitest 4.0.3 has no `basic` reporter module.
- **Fix:** used plain `npx vitest run` for every verification step.
- **Files modified:** none (command-level substitution only).
- **Commits:** verification step; no code impact.

**2. [Rule 1 - Bug] `tsc --noEmit` broke on `@power-rent/try-catch` import**
- **Found during:** post-Task 3 verification.
- **Issue:** The suite imported `Try` / `NoopReporter` via the package-name alias, but TypeScript does not know about the vitest-only alias. Typecheck failed with `TS2307: Cannot find module '@power-rent/try-catch'`.
- **Fix:** switched the suite to import from `../../core` (relative); kept the package-name usage only inside snippet files where it belongs.
- **Files modified:** `src/__tests__/docs/doctest.test.ts`.
- **Commit:** `0e727cc`.

**3. [Rule 1 - Bug] Dynamic-import smoke check bypassed the alias**
- **Found during:** post-Task 3 verification.
- **Issue:** An indirect-string `await import(pkgName)` was resolving via Node to `dist/esm/index.js` (pre-built dist present in the working tree), so the "alias smoke" was not actually exercising the alias. Warning: `MODULE_TYPELESS_PACKAGE_JSON` on `dist/esm/index.js`.
- **Fix:** replaced the dynamic-import smoke with a direct config-level assertion: read `vite.config.ts`, verify all four `resolve.alias` finds exist and every replacement resolves under `src/`. This is ironclad against dist drift. The actual runtime exercise of the alias happens through the seed fixture's static `import { Try } from '@power-rent/try-catch'` inside a dynamically-loaded `.ts` temp file.
- **Files modified:** `src/__tests__/docs/doctest.test.ts`.
- **Commit:** `0e727cc`.

**4. [Rule 1 - Lint] `no-unnecessary-condition` on `??` with regex match**
- **Found during:** post-Task 3 lint.
- **Issue:** ESLint narrowed `match[2]` from optional to string, flagging the `?? ''` fallback.
- **Fix:** switched to `|| ''`; preserves behavior (empty-string on no-rest, empty-string on undefined) and satisfies the linter.
- **Files modified:** `src/__tests__/docs/doctest-extract.ts`.
- **Commit:** `5933f6e`.

### Deferred (out of scope)

Pre-existing lint errors in `src/__tests__/Try.test.ts` (four `@typescript-eslint/only-throw-error` violations at lines 1803, 1812, 1821, 1829). Logged to `.planning/phases/03-documentation-examples/deferred-items.md`. Not caused by this plan.

## Commit Log

| Commit | Kind | Summary |
| ------ | ---- | ------- |
| `ad897da` | feat | Task 1 — wire vitest aliases |
| `85f584e` | test | Task 2 RED — failing extractor tests |
| `7e33ed8` | feat | Task 2 GREEN — extractor + contributor README |
| `0aabad8` | feat | Task 3 — doctest suite + seed fixture |
| `0e727cc` | fix  | tsc compat + robust alias smoke (Rules 1, 3) |
| `5933f6e` | fix  | lint silence in extractor (Rule 1) |

## Key Decisions (discretionary)

- **Marker choice:** `` ```ts doctest `` with `doctest` as a whitespace-separated token. Chosen over pragma comments (less robust) and `ts eval` (ambiguous with deliberate-failure snippets that may use `eval`).
- **Alias ordering:** ordered array, not object. Object alias lookup is undefined-order in vite; array preserves the sub-path-first match we need.
- **Snippet execution strategy:** temp `.ts` file + dynamic `import()`. Alternative `vm.runInNewContext` was rejected because it requires re-implementing vitest's TS transform.
- **Smoke check on config (not runtime):** avoids the dist-shadowing hazard where a stale `dist/` would make a dynamic package-name import succeed regardless of alias state.
- **tsc compatibility via relative imports:** keeps the plan's "do not touch tsconfig.json" directive intact while still letting `npm run build` (which runs typecheck) succeed.

## Known Stubs

None. The seed fixture is intentional seeding (called out in the plan under `artifacts`) and self-assertive, not a stub.

## Self-Check: PASSED

- `vite.config.ts` exists and contains the four `resolve.alias` entries.
- `src/__tests__/docs/doctest-extract.ts` exists and exports `extractDoctests`.
- `src/__tests__/docs/doctest-extract.test.ts` exists — 9 tests, all passing.
- `src/__tests__/docs/doctest.test.ts` exists — 3 top-level tests + 1 seed snippet case, all passing.
- `src/__tests__/docs/__fixtures__/seed-snippet.md` exists, contains `ts doctest` marker.
- `src/__tests__/docs/README.md` exists, ~60 lines, covers marker + execution contract.
- Commits `ad897da`, `85f584e`, `7e33ed8`, `0aabad8`, `0e727cc`, `5933f6e` all present in `git log`.
- `npx vitest run` green (234/234), `npm run typecheck` green.
