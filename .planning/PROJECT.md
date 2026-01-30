# @power-rent/try-catch

## What This Is

A TypeScript utility library for full-stack teams to handle async errors with a fluent Try API and optional Sentry reporting via `report()`. It supports Node, browser, and Next.js entry points with consistent behavior across environments.

## Core Value

A fluent Try API that never hides errors.

## Requirements

### Validated

- ✓ Developers can run functions via `Try` and choose `.value()`, `.default()`, `.error()`, or `.unwrap()` for clear outcomes — existing
- ✓ Developers can send errors to Sentry using `.report(message)` with tags and breadcrumbs — existing
- ✓ Developers can use environment-specific entry points (`/node`, `/browser`, `/nextjs`) — existing

### Active

- [ ] Documentation aligns with real usage patterns, especially `report()` behavior and error outcomes
- [ ] Type safety is preserved across sync/async functions and all execution paths
- [ ] Core error-handling flows are well tested (value/default/error/unwrap + reporting)

### Out of Scope

- New runtimes (Deno/Bun/Cloudflare) — keep focus on current environments

## Context

- Existing codebase with a modular core Try class, reporter abstraction, and platform adapters
- Sentry integration is opt-in via `.report()`; reporting uses adapters per environment

## Constraints

- **Quality**: Type-safe API and strong test coverage — required
- **Runtime**: Node.js >= 20 — current support target

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target both server and browser usage | Library is meant to be shared across environments | — Pending |
| Reporting via explicit `.report()` | Keeps error handling intentional and opt-in | — Pending |
| No new runtimes in v1 | Reduce scope and keep focus on current adapters | — Pending |

---
*Last updated: 2026-01-30 after initialization*
