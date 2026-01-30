# Project Research Summary

**Project:** @power-rent/try-catch
**Domain:** TypeScript Try-style error-handling library with optional Sentry reporting (node/browser/nextjs)
**Researched:** 2026-01-30
**Confidence:** MEDIUM

## Executive Summary

This is a TypeScript error-handling utility built around a fluent Try/Result API with optional Sentry reporting across Node, browser, and Next.js. Expert implementations keep the core API dependency-free, provide explicit error channels, and integrate reporting as a side-effect hook rather than a default behavior. The core value is predictable error handling with clear reporting semantics and no global Sentry side effects.

Recommended approach: stabilize a minimal, typed Try/Result core (sync + async), then layer a reporter abstraction with per-environment entry points and a Sentry adapter that respects host-owned initialization and scoped metadata. Maintain explicit `.report()` usage, scoped `withScope` metadata, and error normalization to keep Sentry events actionable.

Key risks are silent error swallowing, duplicate Sentry events across runtimes, and tree-shaken or misconfigured Sentry initialization. Mitigate with explicit semantics and tests in Phase 1, adapter contract design in Phase 2, and packaging/docs guidance for Next.js and browser configuration in Phase 2/3.

## Key Findings

### Recommended Stack

Use a modern TypeScript toolchain with Sentry SDKs aligned across environments and a library bundler suited for multi-entry ESM/CJS. Prioritize type-testing and package linting to protect exported types and entrypoint correctness.

**Core technologies:**
- TypeScript 5.9.3: language + type system — current stable for library authoring and safe exports.
- @sentry/node/browser/nextjs 10.38.0: reporting adapters — official SDKs aligned by major version.
- Rollup 4.57.1: library bundling — multi-entry, mature ecosystem; supports ESM/CJS outputs.

### Expected Features

MVP requires sync + async Try wrappers with typed error channels and explicit Sentry reporting that supports tags/breadcrumbs and per-call scope isolation. Differentiation comes from fluent Sentry enrichment and error normalization while keeping the API small.

**Must have (table stakes):**
- Sync Try wrapper + fluent chain — users expect Try/Result ergonomics.
- Async Try support — parity with existing Result libraries.
- Explicit `report()` with scoped Sentry capture — core integration promise.
- Tags/breadcrumbs + scope isolation — expected Sentry ergonomics.

**Should have (competitive):**
- Fluent Sentry enrichment chain — makes reporting a first-class flow.
- Error normalization for non-Error throws — improves grouping and stack quality.
- Debug mode for local breadcrumbs — DX without Sentry.

**Defer (v2+):**
- Result-style combinators (combine/all/partition) — scope creep beyond Try API.
- Lint plugin for “must handle” semantics — likely separate package.

### Architecture Approach

Adopt a layered architecture: dependency-free core Try/Result, explicit error normalization utilities, a reporter interface, and Sentry adapters isolated behind environment entry points to preserve optionality and tree-shaking.

**Major components:**
1. Core Try/Result — typed success/error encapsulation, sync/async combinators.
2. Error normalization — convert unknown to Error, shape metadata.
3. Reporter interface — side-effect boundary with no-op default.
4. Sentry adapters — node/browser/nextjs capture + scope enrichment.
5. Entry points — environment-specific exports and wiring.

### Critical Pitfalls

1. **Silent error swallowing via fluent API** — document explicit semantics, add tap/inspect helpers, and test that report/unwrap behavior is intentional.
2. **Duplicate events across runtimes (Next.js)** — avoid library-owned Sentry init; accept capture function/client injection; document dedupe guidance.
3. **Tree-shaken or non-executed init** — keep init in explicit entrypoints and document sideEffects/Next.js guidance.
4. **Non-Error exceptions degrade grouping** — normalize unknowns into Error with metadata; enforce in `report()` typing.
5. **Browser DSN exposure mistakes** — document env-prefix rules and allow runtime config injection.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Try/Result Semantics
**Rationale:** All other features depend on stable sync/async Try semantics and typed error handling.
**Delivers:** Sync + async Try wrappers, typed error channel, explicit unwrap/default/value/error semantics, basic report hook contract.
**Addresses:** Sync/async Try, typed error channel, explicit `report()` semantics.
**Avoids:** Silent error swallowing; non-Error exception handling issues.

### Phase 2: Sentry Adapters + Entry Points
**Rationale:** Reporting value requires runtime-specific adapters and strict isolation of Sentry side effects.
**Delivers:** node/browser/nextjs entry points, reporter interface implementation, scoped tags/breadcrumbs, adapter injection patterns.
**Uses:** @sentry/* SDKs aligned by version; explicit scope usage.
**Implements:** Reporter boundary + adapter layer + entrypoint wiring.
**Avoids:** Duplicate events, library-owned Sentry init, tree-shaken init, DSN exposure mistakes.

### Phase 3: Production Hardening + Docs
**Rationale:** Adoption depends on reliable production telemetry and clear configuration guidance.
**Delivers:** Error normalization improvements, debug mode, release/sourcemap guidance, filtering/sampling examples, ad-blocker/tunnel guidance.
**Avoids:** Source-map/release mismatch, blocked browser reporting, noise overload.

### Phase Ordering Rationale

- Core semantics and typed errors must be stable before adapters can safely report.
- Adapter isolation and entry points are required to keep Sentry optional and tree-shakeable.
- Production guidance and hardening depend on real adapter behavior and packaging decisions.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Next.js multi-runtime adapter behavior, sideEffects/tree-shaking implications.
- **Phase 3:** Source map/release alignment and Sentry tunnel/ad-blocker mitigation.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Core Try/Result semantics mirror well-documented Result libraries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Versions from npm registry; bundler choice conflicts with current tsup usage. |
| Features | MEDIUM | Consensus from competitor libraries and Sentry docs. |
| Architecture | MEDIUM | Standard library layering patterns; needs validation with existing code. |
| Pitfalls | MEDIUM | Based on Sentry troubleshooting and real-world integration guidance. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Bundler strategy mismatch:** research recommends Rollup/tsdown, repo uses tsup — decide during planning with build/test impact analysis.
- **Adapter contract specifics:** confirm exact API surface for Sentry client/capture injection across node/browser/nextjs.
- **Next.js runtime edge cases:** validate duplicate events and tree-shaking behavior in sample apps.

## Sources

### Primary (HIGH confidence)
- https://docs.sentry.io/platforms/javascript/ — SDK usage, capture, scopes
- https://docs.sentry.io/platforms/javascript/guides/nextjs/ — Next.js runtime integration
- https://registry.npmjs.org/ — version verification for TS, Sentry, Rollup, Vitest

### Secondary (MEDIUM confidence)
- https://github.com/supermacro/neverthrow — Result/ResultAsync patterns
- https://github.com/lgse/ts-results — Result API expectations
- https://github.com/brettchalupa/result — try/tryAsync combinators
- https://docs.sentry.io/platforms/javascript/troubleshooting/ — integration pitfalls
- https://sentry.zendesk.com/hc/en-us/articles/24672956518043--NextJS-Why-do-I-see-duplicate-or-unknown-releases — release duplication guidance

---
*Research completed: 2026-01-30*
*Ready for roadmap: yes*
