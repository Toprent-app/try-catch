# Phase 3: Documentation & Examples - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Align all user-facing docs and examples with the real behavior delivered in Phases 1–2. Scope covers `README.md`, everything under `docs/`, and everything under `examples/`. Satisfies DX-01: docs read like native English error handling and match actual outcomes.

Out of scope: new features, API changes, new runtimes, CHANGELOG.md, marketing site, migration guides from other libraries.

</domain>

<decisions>
## Implementation Decisions

### Doc Surface (scope)
- **D-01:** In scope: `README.md`, `docs/*.md` (ARCHITECTURE, CONFIGURATION, DEVELOPMENT, GETTING-STARTED, TESTING), and `examples/` (including `comprehensive-examples.ts`, `custom-reporter.ts`, `examples/README.md`). All three must be audited and updated to match current `src/` behavior.

### Audience & Voice
- **D-02:** README leads with newcomer-oriented plain-English framing (keep/expand the existing "Think and write in plain English" intro). API reference comes after the tour. Satisfies DX-01 phrasing goal.

### Verification Harness
- **D-03:** Ship a Vitest suite that extracts tagged fenced code blocks from `README.md` and executes them with a mock/Noop reporter. CI fails when a documented snippet no longer compiles or runs correctly. This is the primary DX-01 "matches actual outcomes" safeguard.
- **D-04:** Tagging convention for extractable blocks: ` ```ts doctest ` (or equivalent marker) — planner to pick exact token during research. Non-executable snippets (e.g., `npm install` bash, deliberately broken pedagogical examples) remain untagged and are skipped.
- **D-05:** The harness runs on the package's own source (not the published dist). Imports in snippets use the package name (`@power-rent/try-catch/...`); the harness wires these to the local `src/` via vitest config aliases so snippets stay copy-pasteable while still executing against real code.
- **D-06:** Sentry adapters stay mocked (pattern from Phase 2 adapter tests via `Try.setDefaultReporter`). Doctest harness does not hit real Sentry.

### Phase 2 Behavior Changes in Docs
- **D-07:** Surface non-Error normalization (DIAG-01 / Phase 2 D-01, D-02): brief README note explaining that thrown non-Error values (strings, numbers, plain objects) are wrapped in `new Error('Non-Error thrown (<type>)')` with the original value preserved on `cause`. Include a short example.
- **D-08:** Surface breadcrumb-recording consistency (SENT-03 / Phase 2 D-06): clarify in the `.breadcrumbs()` API docs that configured breadcrumbs are recorded on every terminal method (`.value()`, `.unwrap()`, `.error()`, `.result()`), not only `.value()`.
- **D-09:** Do NOT document the Next.js double-add fix (Phase 2 D-07). It is an internal bug fix with no user-visible API change.

### Sync vs Async Clarity
- **D-10:** Add a dedicated, top-of-API sync-vs-async section in `README.md` with the `await new Try(syncFn)` caveat front-and-center. Use the existing GETTING-STARTED sync/async block as the source of truth — same wording and examples reconciled across both files.

### Examples Directory
- **D-11:** Full audit + rewrite of `examples/`. Every pattern shown must match current `src/` behavior; drop stale patterns (e.g., anything not supported by the current Reporter interface, or Phase-1-pre `.default()` semantics). `examples/README.md` and the `.ts` files are all in scope.
- **D-12:** Examples must use real import paths (`@power-rent/try-catch/node`, etc.), not relative `../src/...` paths. This matches how consumers actually import and keeps examples copy-pasteable.

### Docs Directory
- **D-13:** `docs/ARCHITECTURE.md` — verify sync/async path description, reporter integration, and Phase 2 changes are reflected.
- **D-14:** `docs/GETTING-STARTED.md` — already strong; reconcile the sync/async section with the new dedicated README section (D-10) so they agree word-for-word on the caveat.
- **D-15:** `docs/CONFIGURATION.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md` — audit for drift against current tsup/eslint/vitest configs and test patterns; fix inaccuracies but no structural rewrite.

### Claude's Discretion
- Exact marker token for extractable code blocks (e.g., `ts doctest` vs `ts eval` vs pragma comment).
- Whether to split README's API section into a separate `docs/API.md` — only if README grows past ~500 lines after updates; otherwise keep single-file.
- Phrasing of the normalization note (D-07) — optimize for newcomer-first framing (D-02).
- Whether to add short runnable snippet to `examples/custom-reporter.ts` demonstrating the `NoopReporter` baseline.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — DX-01 is the sole Phase 3 requirement

### Prior Phase Decisions (inform what to document)
- `.planning/phases/02-reporting-runtime-entry-points/02-CONTEXT.md` — Phase 2 decisions D-01 through D-07; D-01/D-02/D-06 must be surfaced in docs (per D-07/D-08 here)
- `.planning/phases/01-core-try-semantics/` — Core API contract that examples must match

### Docs to audit/update
- `README.md` — primary user-facing doc, newcomer-first lead
- `docs/ARCHITECTURE.md` — internal model
- `docs/CONFIGURATION.md` — build/tsup/eslint/tsconfig
- `docs/DEVELOPMENT.md` — contributor guide
- `docs/GETTING-STARTED.md` — entry-point selection + sync/async (reconcile with README)
- `docs/TESTING.md` — test conventions
- `examples/README.md`
- `examples/comprehensive-examples.ts`
- `examples/custom-reporter.ts`

### Source of truth for behavior
- `src/core/Try.ts` — `execute()`, `reportError()`, `addBreadcrumbsIfConfigured()`, all terminal methods
- `src/core/reporter.ts` — `Reporter` interface, `NoopReporter`
- `src/adapters/node/reporter.ts`, `src/adapters/browser/reporter.ts`, `src/nextjs/SentryReporter.ts`
- `src/{node,browser,nextjs}/index.ts` — entry-point registration

### Test patterns to mirror for the harness
- `src/__tests__/` — Phase 2 adapter tests demonstrate `Try.setDefaultReporter` + mocked Sentry pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NoopReporter` in `src/core/reporter.ts` — default reporter for the doctest harness; no Sentry contact
- `Try.setDefaultReporter()` / `Try.getDefaultReporter()` — pattern for swapping reporters per test, then restoring
- Phase 2 adapter test files — template for mocking `@sentry/*` packages in the harness
- Vitest config — already in project; extend with aliases mapping `@power-rent/try-catch/*` → local `src/*`

### Current State Observations
- `README.md` is 383 lines; already has strong plain-English intro. Main gaps: no sync/async dedicated section, no mention of non-Error normalization, breadcrumbs wording implies `.value()`-only recording.
- `docs/GETTING-STARTED.md` (lines 97–122) has the cleanest sync/async explanation — adopt as canonical source.
- `examples/comprehensive-examples.ts` (977 lines) uses relative `../src/...` imports and mixes patterns; full rewrite will shrink and modernize.
- No existing doctest tooling in the repo; D-03 introduces a new vitest suite (not a new tool).

### Integration Points
- Harness touches: `vitest.config.ts` (aliases), new `src/__tests__/docs/` (or `test/docs/`) suite, `package.json` (test script already runs all vitest files by default).
- `README.md` edits will likely cascade into `docs/GETTING-STARTED.md` for consistency (D-10, D-14).
- `examples/` rewrite is the largest single chunk of content churn.

</code_context>

<specifics>
## Specific Ideas

- Newcomer-first voice: keep sentence-shaped intro ("Try to run X. If it fails, choose the behavior..."). Expand only where clarity demands.
- Plain-English framing for error normalization: "If your function throws something that isn't an Error (a string, number, or plain object), the library wraps it so your error handling never has to special-case it."
- Sync/async caveat phrasing: lead with "`await new Try(syncFn)` returns the Try instance, not the result — use `.value()` / `.unwrap()` / `.error()` instead."

</specifics>

<deferred>
## Deferred Ideas

- `CHANGELOG.md` updates for Phase 2 fixes — explicitly skipped this phase per user decision; revisit before release tagging.
- Migration guide from `try/catch` or other Result-style libs — out of scope for v1; candidate for future phase.
- Separate `docs/API.md` split — only triggered if README grows past ~500 lines after updates (Claude's Discretion under D-02).
- Interactive playground / stackblitz link — not in current roadmap.
- Benchmarks / performance docs — not a DX-01 concern.

</deferred>

---

*Phase: 03-documentation-examples*
*Context gathered: 2026-04-18*
