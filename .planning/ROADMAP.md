# Roadmap: @power-rent/try-catch

## Overview

This roadmap delivers a fluent, type-safe Try API first, then layers in Sentry reporting with runtime entry points and diagnostics. Documentation comes last to ensure examples reflect the real behavior users will see.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Try Semantics** - Users can handle sync/async errors with typed outcomes.
- [ ] **Phase 2: Reporting + Runtime Entry Points** - Users can report errors with Sentry across environments, with diagnostics.
- [ ] **Phase 3: Documentation & Examples** - Users can follow clear docs that match real behavior.

## Phase Details

### Phase 1: Core Try Semantics
**Goal**: Users can handle sync/async errors with a type-safe Try API.
**Depends on**: Nothing (first phase)
**Requirements**: TRY-01, TRY-02, TRY-03, TRY-04
**Success Criteria** (what must be TRUE):
  1. User can wrap sync functions with `new Try(fn, ...args)` and retrieve outcomes via `.value()`, `.error()`, or `.unwrap()`.
  2. User can wrap async functions with the same API and retain correct TypeScript inference for success and error channels.
  3. User can supply a fallback via `.default(value)` and receive it on error.
**Plans**: Complete

Delivered:
- `new Try(fn, ...args)` with lazy execution and cached outcomes
- `.value()`, `.error()`, `.unwrap()`, `.result()`, `.default(value)`, and `.finally(callback)`
- Sync return paths that resolve immediately and async paths that return Promises
- Type inference updates to preserve async/sync behavior and avoid `never`-driven collapse
- Verification coverage across runtime behavior and type-safety expectations

Plans:
- [x] 01-01: Implement core sync/async Try semantics and verify behavior

### Phase 2: Reporting + Runtime Entry Points
**Goal**: Users can report errors with Sentry across runtimes, with clear diagnostics.
**Depends on**: Phase 1
**Requirements**: SENT-01, SENT-02, SENT-03, SENT-04, ENTRY-01, ENTRY-02, ENTRY-03, DIAG-01, DIAG-02
**Success Criteria** (what must be TRUE):
  1. User can call `.report(message)` to send the current error to Sentry.
  2. User can attach tags and breadcrumbs in the fluent chain before reporting.
  3. Reporting defaults avoid noisy handled errors unless explicitly requested.
  4. User can import runtime-specific entry points (`/node`, `/browser`, `/nextjs`) with consistent reporting behavior.
  5. Breadcrumbs configuration is type-safe and matches README examples.
  6. Non-Error throws are normalized to Error before reporting, and debug mode logs locally without Sentry.
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Normalize non-Error throws in execute() and unify breadcrumb recording across unwrap/error/result (DIAG-01, SENT-03)
- [x] 02-02-PLAN.md — Remove internal addBreadcrumbs call from nextjs SentryReporter.report() (D-07 / SENT-03)
- [x] 02-03-PLAN.md — Add adapter tests for node, browser, nextjs including D-07 regression guard

### Phase 3: Documentation & Examples
**Goal**: Users can rely on docs/examples that reflect real Try and reporting behavior.
**Depends on**: Phase 2
**Requirements**: DX-01
**Success Criteria** (what must be TRUE):
  1. User can follow docs/examples for core Try usage that read like native English error handling and match actual outcomes.
  2. User can follow docs/examples for reporting and entry points that reflect real `report()` behavior and configuration.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 2 → 2.1 → 2.2 → 3 → 3.1 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Try Semantics | 1/1 | Complete | 2026-02-01 |
| 2. Reporting + Runtime Entry Points | 0/TBD | Not started | - |
| 3. Documentation & Examples | 0/TBD | Not started | - |
