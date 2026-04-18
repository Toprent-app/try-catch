# Milestones: @power-rent/try-catch

## v1.2.0 — Type-safe Try + Sentry + Docs

**Shipped:** 2026-04-18
**Phases:** 3 | **Plans:** 5 | **Tests:** 242/242 passing

### Delivered

A fluent, type-safe `Try` API for sync + async error handling, with Sentry reporting across Node/browser/Next.js entry points, validated by an executable doctest harness.

### Key Accomplishments

1. Sync + async unified under one `Try` API with lazy thenable installation — `await new Try(syncFnReturningPromise)` works correctly.
2. Type-safe error channel preserved across all execution paths (`.value`, `.error`, `.unwrap`, `.result`, `.default`).
3. Sentry reporting via explicit `.report(message)` with type-safe `BreadcrumbConfig<TArgs>` and three runtime adapters (node/browser/nextjs).
4. Non-Error throws normalized via `Try.normalizeThrown()` at both catch sites; debug mode logs locally without Sentry.
5. Unified breadcrumb recording across `value/unwrap/error/result` terminal branches; D-07 Next.js double-add fix.
6. Doctest harness — 11 tagged ` ```ts doctest ` snippets in README/docs execute against live `src/` via vite aliases, holding docs-truth contract in CI.

### Stats

- 87 files changed, ~15,600 insertions / ~1,700 deletions across milestone
- 5,438 LOC TypeScript in `src/`
- 242/242 tests passing across 9 files
- Timeline: 2026-01-30 → 2026-04-18

### Known Deferred Items

- Pre-existing lint errors in `src/__tests__/Try.test.ts` (tracked in `phases/03-documentation-examples/deferred-items.md`)
- No `tsx` pinned as devDependency for examples runner

### Archives

- `milestones/v1.2.0-ROADMAP.md` — full phase details + decisions
- `milestones/v1.2.0-REQUIREMENTS.md` — requirements snapshot (14/14 satisfied)
- `milestones/v1.2.0-MILESTONE-AUDIT.md` — audit report
