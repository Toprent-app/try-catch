# Requirements: @power-rent/try-catch

**Defined:** 2026-01-31
**Core Value:** A fluent Try API that never hides errors.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Try API

- [ ] **TRY-01**: User can wrap sync functions with `new Try(fn, ...args)` and execute via `.value()`, `.error()`, or `.unwrap()`
- [ ] **TRY-02**: User can wrap async functions with the same fluent API and preserve type inference
- [ ] **TRY-03**: User can provide a fallback via `.default(value)` and receive it on error
- [ ] **TRY-04**: Error channel is type-safe across all execution paths

### Sentry Reporting

- [ ] **SENT-01**: User can call `.report(message)` to capture the error via Sentry
- [ ] **SENT-02**: User can attach tags and breadcrumbs to reported events via fluent chain
- [ ] **SENT-03**: Errors are reported only when `.report()` is explicitly called, but breadcrumbs are always recorded when `.breadcrumbs()` is used
- [ ] **SENT-04**: Breadcrumbs configuration is type-safe and matches README examples

### Entry Points

- [ ] **ENTRY-01**: Node entry point available at `@power-rent/try-catch/node`
- [ ] **ENTRY-02**: Browser entry point available at `@power-rent/try-catch/browser`
- [ ] **ENTRY-03**: Next.js entry point available at `@power-rent/try-catch/nextjs`

### Diagnostics

- [ ] **DIAG-01**: Non-Error throws are normalized into an Error before reporting
- [ ] **DIAG-02**: Debug mode allows local error logging without Sentry

### Developer Experience

- [ ] **DX-01**: Documentation and examples read like native English error handling

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Sentry Reporting

- **SENT-05**: Scoped metadata isolation per call to prevent cross-request bleed
- **SENT-06**: Zero runtime dependency when Sentry is unused

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New runtimes (Deno/Bun/Cloudflare) | Focus on current environments for v1 |
| Result-style combinators (combine/all/partition) | Scope creep beyond focused Try API |
| Lint plugin for “must handle” semantics | Likely separate package later |
| Auto-report all errors by default | Creates Sentry noise; report is explicit |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRY-01 | Phase 1 | Pending |
| TRY-02 | Phase 1 | Pending |
| TRY-03 | Phase 1 | Pending |
| TRY-04 | Phase 1 | Pending |
| SENT-01 | Phase 2 | Pending |
| SENT-02 | Phase 2 | Pending |
| SENT-03 | Phase 2 | Pending |
| SENT-04 | Phase 2 | Pending |
| ENTRY-01 | Phase 2 | Pending |
| ENTRY-02 | Phase 2 | Pending |
| ENTRY-03 | Phase 2 | Pending |
| DIAG-01 | Phase 2 | Pending |
| DIAG-02 | Phase 2 | Pending |
| DX-01 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after initial definition*
