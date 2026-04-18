---
phase: 3
plan: "03-02"
subsystem: docs
tags: [dx, docs, readme, doctest, normalization, breadcrumbs]
dependency_graph:
  requires:
    - src/__tests__/docs/doctest.test.ts (from 03-01)
    - src/__tests__/docs/doctest-extract.ts (from 03-01)
    - vite.config.ts resolve.alias (from 03-01)
    - src/core/Try.ts normalizeThrown, addBreadcrumbsIfConfigured
  provides:
    - README.md (newcomer-first, sync/async, normalization note, tagged snippets)
    - docs/GETTING-STARTED.md Sync vs Async section carrying `ts doctest` markers
    - docs/ARCHITECTURE.md normalization + unified breadcrumb recording paragraphs
    - docs/CONFIGURATION.md vite.config alias row
    - docs/DEVELOPMENT.md refreshed directory layout + accurate CI note
    - docs/TESTING.md expanded test-file table + "Doc verification harness" section
  affects:
    - CI (doctest harness exercises 9 tagged snippets on every run)
tech_stack:
  added: []
  patterns:
    - byte-identical canonical prose copied from GETTING-STARTED into README
    - marker-tagged fenced blocks executable under NoopReporter + mocked Sentry
key_files:
  created: []
  modified:
    - README.md
    - docs/GETTING-STARTED.md
    - docs/ARCHITECTURE.md
    - docs/CONFIGURATION.md
    - docs/DEVELOPMENT.md
    - docs/TESTING.md
decisions:
  - D-02 newcomer-first framing preserved and expanded at the top of README
  - D-07 Non-Error normalization surfaced with a runnable string-throw example
  - D-08 breadcrumbs documented as recorded on every terminal method
  - D-09 no mention of the Next.js double-add internal fix in user-facing docs
  - D-10 dedicated Sync vs Async section added to README
  - D-13 ARCHITECTURE.md now describes normalization step and unified breadcrumb path
  - D-14 README + GETTING-STARTED Sync vs Async sections byte-identical
  - D-15 CONFIGURATION/DEVELOPMENT/TESTING audited surgically against current tooling
metrics:
  tasks: 3
  files_modified: 6
  tagged_snippets_total: 9
---

# Phase 3 Plan 03-02: Docs Pass (README + docs/\*.md) Summary

One-liner: README rewritten newcomer-first with dedicated Sync vs Async
section (byte-identical to GETTING-STARTED), Non-Error normalization note,
accurate breadcrumb semantics, and nine `ts doctest`-tagged executable
snippets; all six targeted docs audited against current source and tooling.

## What shipped

### README.md — rewrite (commit 72d4946)

- Preserved the existing plain-English "Think and write in plain English"
  framing and expanded the newcomer-first tour above any API reference (D-02).
- Added a dedicated `## Sync vs Async` section whose prose and two code
  blocks are byte-identical with `docs/GETTING-STARTED.md` lines 97–137
  (D-10, D-14). The canonical caveat sentence is verbatim:
  `Awaiting a sync Try yields the Try instance, not the result`.
- Added a `## When your function throws something that isn't an Error`
  section with a runnable snippet asserting
  `error.message === 'Non-Error thrown (string)'` and
  `error.cause === 'boom'` (D-07).
- Rewrote the `.breadcrumbs()` API block so it explicitly states
  breadcrumbs are recorded on every terminal method (`.value()`, `.unwrap()`,
  `.error()`, `.result()`) and includes a tagged snippet that registers a
  recording reporter and verifies `addBreadcrumbs` fires on the `.error()`
  path (D-08).
- Clarified the reporter adapter paragraph (removed marketing wording; kept
  the four import paths).
- No reference anywhere to the Next.js double-add internal fix (D-09).
- Total line count: ~350 (well under the 500-line split threshold).

### docs/GETTING-STARTED.md — Sync vs Async markers (commit 72d4946)

- Added the `ts doctest` marker to the two TypeScript fenced blocks inside
  the Sync vs Async section so they execute under the 03-01 harness.
- Kept the section prose verbatim (it is the canonical source README copied
  from). Diff `diff <(README Sync vs Async) <(GETTING-STARTED Sync vs Async)`
  returns empty.
- Left entry-point snippets (Node.js / Next.js / Browser / Plain /
  ConsoleReporter) untagged — they reference external identifiers or
  declare classes that are illustrative, not self-contained assertions.

### docs/ARCHITECTURE.md — normalization + unified breadcrumbs (commit d117fd0)

- Added step 4 ("Thrown-value normalization") to the Data flow list
  describing `Try.normalizeThrown`: non-Error values wrapped with
  `Non-Error thrown (<typeof e>)` + original preserved on `.cause`, applied
  in both sync `catch` and async `.catch` branches (D-13).
- Added a paragraph after the Data flow list noting that when `.report()`
  is not configured but `.breadcrumbs()` is, each terminal method still
  invokes `addBreadcrumbsIfConfigured()` on its error branch, and that the
  call is idempotent (guarded by `local.breadcrumbsAdded`) — so chaining
  `.report()` and another terminal never double-records (D-08).

### docs/CONFIGURATION.md (commit 27e75a3)

- Added a row to the `vite.config.ts` Test Configuration table documenting
  `resolve.alias`: maps `@power-rent/try-catch` and `/node`, `/browser`,
  `/nextjs` subpaths to the corresponding entry under `src/` so doctest
  snippets can import the package by its published name. Notes that
  sub-path aliases must be matched before the bare alias (order-sensitive).

### docs/DEVELOPMENT.md (commit 27e75a3)

- Refreshed the Directory layout block: added `adapters/` and `docs/`
  subtrees under `src/__tests__/`, and added the full `docs/` manifest
  (`ARCHITECTURE`, `CONFIGURATION`, `DEVELOPMENT`, `GETTING-STARTED`,
  `TESTING`).
- Replaced the stale "No CI workflow file was detected" bullet with an
  accurate description of `.github/workflows/ci.yml`: runs `tsc --noEmit`
  and `npm run test` on every push and PR to `main`, on Node.js 20.x,
  `ubuntu-latest`.

### docs/TESTING.md (commit 27e75a3)

- Expanded the test-file table to cover the three adapter suites
  (`node`, `browser`, `nextjs`), the doctest harness
  (`doctest.test.ts`), and the extractor unit tests
  (`doctest-extract.test.ts`).
- Added a `## Doc verification harness` subsection pointing contributors at
  the `ts doctest` marker convention, the scanned surface
  (`README.md`, `docs/*.md`, `src/__tests__/docs/__fixtures__/*.md`), and
  the execution contract (NoopReporter default, `vi.mock` for all three
  Sentry packages, vitest aliases for package-name imports). Links to
  `src/__tests__/docs/README.md` for the full contract.

## Tagged snippet counts

| File | Tagged (`ts doctest`) | Runnable |
|---|---|---|
| README.md | 6 | 6 |
| docs/GETTING-STARTED.md | 2 | 2 |
| docs/ARCHITECTURE.md | 0 | 0 |
| docs/CONFIGURATION.md | 0 | 0 |
| docs/DEVELOPMENT.md | 0 | 0 |
| docs/TESTING.md | 0 (demo block lives inside a nested ````markdown fence, not extracted) | 0 |
| src/__tests__/docs/\_\_fixtures\_\_/seed-snippet.md | 1 (pre-existing from 03-01) | 1 |
| **Total** | **9** | **9** |

All 9 snippets run under `src/__tests__/docs/doctest.test.ts` with
`NoopReporter` + mocked `@sentry/{node,browser,nextjs}` and pass.

## Verification

- `npx vitest run src/__tests__/docs/doctest` — 20 tests pass (9 snippet
  executions + 11 harness/meta assertions + extractor unit tests). See
  `npm test` below for full-suite green.
- Sync vs Async byte-identical guard (from plan's Task 2 verify block):
  ```
  bash -c 'R=$(sed -n "/^## Sync vs Async$/,/^## /p" README.md | sed "\$d"); \
           G=$(sed -n "/^## Sync vs Async$/,/^## /p" docs/GETTING-STARTED.md | sed "\$d"); \
           [ -n "$R" ] && [ -n "$G" ] && [ "$(printf "%s" "$R" | wc -l)" -gt 3 ] && \
           [ "$(printf "%s" "$G" | wc -l)" -gt 3 ] && diff <(printf "%s" "$R") <(printf "%s" "$G")'
  ```
  returns exit 0 with empty output. Both sections extract to 41 lines.
- D-09 leak grep (`grep -Ri "double-add|double add|double\.add"` scoped to
  user-facing surface): hits confined to `.planning/` (permitted) and
  `src/__tests__/Try.test.ts:1922` (internal test name only, not shipped
  docs). Zero hits in `README.md`, `docs/`, `examples/`.
- `docs/ARCHITECTURE.md` contains both `Non-Error thrown` (line 60) and
  explicit unified-breadcrumb wording across all four terminal methods
  (line 67).
- `npm test` — 9 test files, 242 tests, all green.

## Deviations from Plan

### [Rule 3 - Blocking] Replaced plan's `--reporter=basic` with default reporter

- **Found during:** Task 1 verification.
- **Issue:** The plan's verify blocks invoke `npx vitest run ... --reporter=basic`,
  but vitest 4.0.3 treats `basic` as a custom reporter module path (see
  `cli-api.D24RdiHp.js:9005 loadCustomReporterModule`). Running with
  `--reporter=basic` crashes with `ERR_LOAD_URL: Failed to load url basic`
  before any tests execute.
- **Fix:** Ran `npx vitest run src/__tests__/docs/doctest` (default reporter)
  for all plan-specified verify commands. Result identical semantically:
  the harness runs and reports pass/fail per snippet.
- **Files modified:** None — plan instruction treated as illustrative.
- **Commit:** n/a (verification flag, not a source change).

### [Rule 2 - Missing critical functionality] CI workflow note in DEVELOPMENT.md

- **Found during:** Task 3 audit.
- **Issue:** `docs/DEVELOPMENT.md` claimed "No CI workflow file was detected
  in the repository — verification runs locally." The repo ships
  `.github/workflows/ci.yml` running `tsc --noEmit` and `npm run test` on
  push / PR to `main`. This is actively misleading for contributors reading
  the doc.
- **Fix:** Replaced the stale bullet with an accurate description of the
  CI workflow (what runs, on which Node version, on which events).
- **Files modified:** `docs/DEVELOPMENT.md`.
- **Commit:** 27e75a3.

### [Rule 2 - Missing critical functionality] Directory layout stale in DEVELOPMENT.md

- **Found during:** Task 3 audit.
- **Issue:** `docs/DEVELOPMENT.md` Directory layout block listed only four
  test files under `src/__tests__/` (no adapters, no docs subtree) and only
  three docs (`ARCHITECTURE.md`, `CONFIGURATION.md`, `DEVELOPMENT.md`),
  missing `GETTING-STARTED.md` and `TESTING.md`. Newcomers would not find
  the adapter test pattern or doctest harness from this doc.
- **Fix:** Added `adapters/`, `docs/` subtrees and updated the `docs/`
  manifest to list all five files.
- **Files modified:** `docs/DEVELOPMENT.md`.
- **Commit:** 27e75a3.

Everything else executed as written.

## Commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Rewrite README (voice, sync/async, normalization, breadcrumbs, tags) + tag GETTING-STARTED Sync vs Async blocks | `72d4946` | `README.md`, `docs/GETTING-STARTED.md` |
| 2 | ARCHITECTURE.md normalization + unified breadcrumb recording | `d117fd0` | `docs/ARCHITECTURE.md` |
| 3 | CONFIGURATION/DEVELOPMENT/TESTING audit against current tooling | `27e75a3` | `docs/CONFIGURATION.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md` |

## Self-Check: PASSED

- Files verified present with `ls -l`:
  - `README.md`, `docs/GETTING-STARTED.md`, `docs/ARCHITECTURE.md`,
    `docs/CONFIGURATION.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`.
- Commit hashes verified in `git log --oneline -10`:
  - `72d4946`, `d117fd0`, `27e75a3`.
- Test suite: 9 files / 242 tests / all passing.
