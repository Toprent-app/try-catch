# Feature Research

**Domain:** TypeScript error-handling utility (Try/Result) with optional Sentry reporting
**Researched:** 2026-01-30
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sync Try wrapper for throwing functions | Competing Result libs provide safe wrappers and explicit errors | LOW | Supports `new Try(fn)` → `.value()`/`.error()`/`.unwrap()` style access with typed result | 
| Async Try support | Competitors (neverthrow/Result.js) provide async variants | MEDIUM | Must handle both `Promise` and sync throw; preserve type inference |
| Fluent chain with default fallback | Try-style ergonomics are core UX | LOW | `default()` should provide fallback value for Err path |
| Type-safe error channel | Result libraries hinge on explicit error types | MEDIUM | Error typing should be preserved through chain |
| Explicit Sentry error reporting | Sentry SDK supports manual `captureException` | MEDIUM | `report()` should call `captureException` and allow opt-in |
| Add tags/breadcrumbs for reported events | Sentry supports tags and breadcrumbs | MEDIUM | Chain methods like `tag()`/`breadcrumbs()` should map to Sentry scopes |
| Scoped metadata isolation per call | Sentry scopes are per-execution context | MEDIUM | Use `withScope` to avoid cross-request bleed |
| Node/Browser/NextJS entry points | Project context requires multi-target SDKs | MEDIUM | Separate entry points align with Sentry SDK packages |
| Zero-runtime dependency when Sentry unused | Optional Sentry reporting should be opt-in | LOW | No-ops or lazy import when `.report()` not used |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fluent Sentry enrichment chain | Makes Sentry context a first-class part of error flow | MEDIUM | Chainable `breadcrumbs()`/`tag()`/`debug()` on Try object |
| Error normalization for Sentry | Sentry warns non-Error objects may lack stack | MEDIUM | Convert non-Error throws into `Error` with `cause` and metadata |
| Per-call scope isolation with no global mutation | Avoids noisy/incorrect Sentry metadata | MEDIUM | Always apply tags/breadcrumbs inside `withScope` only |
| Debug mode with local breadcrumbs | Dev ergonomics without Sentry | LOW | `debug()` could log to console with breadcrumb summary |
| Opinionated defaults for handled errors | Prevents Sentry noise while still surfacing real failures | MEDIUM | `report()` only on Err unless `debug()` or explicit override |
| Minimal API surface vs Result libraries | Lower learning curve than full Result API | LOW | Keep Try chain focused and documented |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-report every Err by default | “We want zero config” | Spams Sentry with handled errors and noise | Explicit `.report()` only |
| Global Sentry scope mutation | “Make tags stick everywhere” | Causes cross-request contamination | Use `withScope` per Try call |
| Implicit promise monkeypatching | “Make it work everywhere” | Hard to reason about, breaks expectations | Explicit Try wrappers |
| Always rethrow on unwrap | “Fail fast” | Breaks controlled error handling workflows | Provide `.unwrap()` that is explicit + documented |

## Feature Dependencies

```
[Sync Try wrapper]
    └──requires──> [Typed error channel]

[Async Try support]
    └──requires──> [Sync Try wrapper]

[Sentry report()]
    └──requires──> [Async Try support] (for Promise) + [Sync Try wrapper]

[breadcrumbs()/tag()]
    └──requires──> [Sentry report()] + [Scoped metadata isolation]

[debug()]
    └──enhances──> [Sync/Async Try wrapper]
```

### Dependency Notes

- **Sync Try wrapper requires Typed error channel:** Without typed errors, value/error access is weakly typed.
- **Async Try support requires Sync Try wrapper:** async should reuse the same fluent semantics for consistency.
- **Sentry report() requires Async + Sync support:** reporting should work for both sync and async errors.
- **breadcrumbs()/tag() requires Sentry report():** metadata only useful if event is captured.
- **debug() enhances core Try:** optional dev-only logging without Sentry.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Sync Try wrapper + fluent chain — core value proposition
- [ ] Async Try support — parity with competitors
- [ ] Explicit `report()` + scoped Sentry capture — integration promise
- [ ] tags/breadcrumbs on report — expected Sentry ergonomics

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Error normalization for non-Error throws — improves Sentry quality
- [ ] `debug()` diagnostics without Sentry — DX improvement

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Extended Result-style combinators (combine/all/partition) — scope creep vs focused Try API
- [ ] Lint plugin for “must handle” semantics — likely separate package

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Sync Try wrapper + chain | HIGH | LOW | P1 |
| Async Try support | HIGH | MEDIUM | P1 |
| Sentry `report()` | HIGH | MEDIUM | P1 |
| Tags/breadcrumbs support | MEDIUM | MEDIUM | P1 |
| Scope isolation | MEDIUM | MEDIUM | P1 |
| Error normalization | MEDIUM | MEDIUM | P2 |
| Debug mode | MEDIUM | LOW | P2 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | neverthrow | ts-results | Result.js | Our Approach |
|---------|------------|------------|-----------|--------------|
| Sync Result | `Result` with `ok/err`, map/andThen | `Result.ok/fail`, withData | `ok/err`, map/andThen | Try wrapper that exposes value/error directly |
| Async support | `ResultAsync` utilities | Limited in README (sync-first) | `Result.tryAsync` | Try supports async via same chain |
| Safe wrapper for throwing code | `fromThrowable` / `fromPromise` | `Result.try()` | `Result.try()` | `new Try(fn)` handles throws |
| Combining results | `combine`, `combineWithAllErrors` | Has some helpers | `Result.all/partition` | Out of MVP scope |
| Testing helpers | `_unsafeUnwrap` for tests | Not emphasized | `unwrap/expect` | Keep `unwrap` explicit |
| Sentry integration | Not included | Not included | Not included | First-class `report()` with tags/breadcrumbs |

## Sources

- neverthrow README (Result/ResultAsync, helpers): https://raw.githubusercontent.com/supermacro/neverthrow/master/README.md
- ts-results README (Result.ok/fail/try): https://raw.githubusercontent.com/lgse/ts-results/master/README.md
- Result.js README (try/tryAsync, combinators): https://raw.githubusercontent.com/brettchalupa/result/master/README.md
- Sentry JS SDK captureException: https://docs.sentry.io/platforms/javascript/usage/
- Sentry breadcrumbs: https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/
- Sentry scopes/withScope: https://docs.sentry.io/platforms/javascript/enriching-events/scopes/

---
*Feature research for: TypeScript Try-style error handling with Sentry integration*
*Researched: 2026-01-30*
