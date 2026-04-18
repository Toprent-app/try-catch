# @power-rent/try-catch

## What This Is

A TypeScript utility library for full-stack teams to handle sync + async errors with a fluent `Try` API. Optional Sentry reporting via `.report()` is wired through three runtime adapters (Node, browser, Next.js) with consistent semantics.

## Core Value

A fluent Try API that never hides errors — sync stays sync, async stays async, and reporting only fires when you ask for it.

## Current State

**Shipped:** v1.2.0 (2026-04-18)
**Tests:** 242/242 passing
**LOC:** 5,438 TypeScript in `src/`

## Requirements

### Validated

- ✓ TRY-01..04: Type-safe sync + async `Try` API (`.value/.error/.unwrap/.result/.default/.finally`) — v1.2.0
- ✓ SENT-01..04: Sentry reporting via explicit `.report()`; type-safe `BreadcrumbConfig<TArgs>` — v1.2.0
- ✓ ENTRY-01..03: Runtime entry points `/node`, `/browser`, `/nextjs` — v1.2.0
- ✓ DIAG-01..02: Non-Error throws normalized; debug mode logs locally without Sentry — v1.2.0
- ✓ DX-01: Docs/examples read like native English; held by doctest harness in CI — v1.2.0

### Active

(None — define new requirements via `/gsd-new-milestone`)

### Out of Scope

| Feature | Reason |
|---------|--------|
| New runtimes (Deno/Bun/Cloudflare) | Focus on current environments |
| Result-style combinators (combine/all/partition) | Scope creep beyond focused Try API |
| Lint plugin for "must handle" semantics | Likely separate package later |
| Auto-report all errors by default | Creates Sentry noise; report is explicit |

## Context

- 5,438 LOC TypeScript across `src/core`, `src/node`, `src/browser`, `src/nextjs`, `src/__tests__`
- Sentry integration is opt-in via `.report()`; adapters per environment
- Doctest harness (vite aliases + `NoopReporter`) ensures README/docs execute against live `src/`
- Non-Error throws normalized centrally in `Try.execute()` so adapters stay thin

## Constraints

- **Quality:** Type-safe API, strong test coverage — 242/242 passing
- **Runtime:** Node.js >= 20 — current support target

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target both server and browser usage | Library shared across environments | ✓ Good |
| Reporting via explicit `.report()` | Keeps error handling intentional and opt-in | ✓ Good |
| Return-type generics preserve async/sync inference | Avoid `Promise<unknown>` collapse for sync callers | ✓ Good |
| Treat `never` as non-promise in `IfPromise` | Avoid type collapse for callers that throw | ✓ Good |
| Sync paths immediate, async paths Promise-based | Matches native error-handling expectations | ✓ Good |
| Normalize non-Error throws in `execute()`, not adapter | Single source of truth; adapters stay thin | ✓ Good |
| Unified breadcrumb path across all terminal branches | Eliminates surprise "breadcrumbs only on report" | ✓ Good |
| Doctest harness over hand-maintained examples | Docs can never drift from `src/` | ✓ Good |
| No new runtimes in v1 | Reduce scope and keep focus on current adapters | ✓ Good |

## Next Milestone Goals

TBD — run `/gsd-new-milestone` to define scope.

---
*Last updated: 2026-04-18 after v1.2.0 milestone*
