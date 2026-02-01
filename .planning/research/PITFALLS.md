# Pitfalls Research

**Domain:** TypeScript Try-style async error-handling library with optional Sentry reporting (node/browser/nextjs)
**Researched:** 2026-01-30
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Silent error swallowing via fluent API

**What goes wrong:**
Errors are converted into ok/err values and never surface to global handlers or Sentry unless the user remembers to call `report()`.

**Why it happens:**
Fluent APIs make it easy to “handle” errors without surfacing them; consumers assume unhandled errors still bubble.

**How to avoid:**
Document explicit semantics: `report()` is side-effecting and does **not** swallow unless `.unwrap()` or `.throw()` is used. Provide `tapError`/`inspectError` helpers and warn in docs that Try chains prevent unhandled rejection capture. Add tests that verify errors still surface when requested.

**Warning signs:**
Issue reports like “Sentry stopped seeing errors after migrating to Try”; tests that only check return values but not reporting side effects.

**Phase to address:**
Phase 1 — Core API semantics + tests.

---

### Pitfall 2: Duplicate events across runtimes (Next.js client/server/edge)

**What goes wrong:**
The same error is captured multiple times because adapters initialize Sentry in multiple entry points or create multiple clients.

**Why it happens:**
Next.js requires distinct entry points; developers often init Sentry separately and double-capture when the same error traverses boundaries.

**How to avoid:**
Avoid creating new Sentry clients inside the library. Accept a client or `captureException` function injection. Provide deduping guidance (e.g., tag + event fingerprinting). Link to Sentry guidance on multiple instances.

**Warning signs:**
Users see duplicated issues with identical stack traces and timestamps across client/server.

**Phase to address:**
Phase 2 — Sentry adapter design + Next.js entrypoint guidance.

---

### Pitfall 3: Sentry init tree-shaken or not executed

**What goes wrong:**
Sentry does not send events because initialization was removed by aggressive tree-shaking or never ran in target env.

**Why it happens:**
Frameworks (Next.js) can tree-shake side-effectful init when `sideEffects: false` or when init is placed in a tree-shaken module.

**How to avoid:**
Document `sideEffects` guidance and place initialization in explicit entrypoints. Provide adapter patterns that are clearly side-effectful, and avoid implicit init from library import.

**Warning signs:**
No events in Sentry; console shows SDK not initialized; Next.js troubleshooting points to `sideEffects: false`.

**Phase to address:**
Phase 2 — Adapter integration + packaging guidance.

---

### Pitfall 4: Missing/incorrect DSN exposure in browser builds

**What goes wrong:**
Browser bundle does not contain DSN because env vars aren’t exposed (e.g., missing `NEXT_PUBLIC_`), so reporting silently fails.

**Why it happens:**
Environment variable exposure rules differ per framework; library authors forget to document them for each entrypoint.

**How to avoid:**
Document env var prefixes per framework and provide runtime config injection API rather than relying on build-time envs.

**Warning signs:**
“SDK not sending data” reports; missing DSN in runtime config; only server-side events appear.

**Phase to address:**
Phase 2 — Adapter setup docs.

---

### Pitfall 5: Non-Error exceptions degrade grouping and signal quality

**What goes wrong:**
Events show “Non-Error exception” because `report()` is called with plain objects or strings from Try results.

**Why it happens:**
Try APIs often allow `Err<unknown>`; consumers pass raw values instead of `Error` objects.

**How to avoid:**
Normalize to `Error` internally (wrap non-Error in `Error` with metadata). Provide a typed helper `asError()` and enforce via overloads in `report()`.

**Warning signs:**
Sentry issues with “Non-Error exception” and poor stack traces.

**Phase to address:**
Phase 1 — Core API + type design.

---

### Pitfall 6: Source map/release mismatch breaks stack trace usefulness

**What goes wrong:**
Events appear but stack traces are unreadable due to missing source maps, or duplicate/unknown releases appear in Next.js.

**Why it happens:**
Release values and source map upload steps are inconsistent or overridden by bundler plugins.

**How to avoid:**
Provide explicit docs for release/source map setup and warn about Next.js release injection conflicts. Encourage use of Sentry wizard and CI upload.

**Warning signs:**
Minified stack traces in Sentry; multiple unexpected releases after enabling `@sentry/nextjs`.

**Phase to address:**
Phase 3 — Build/release pipeline docs.

---

### Pitfall 7: Reporting blocked by ad-blockers or browser privacy

**What goes wrong:**
Browser events silently fail to send; local dev works, production misses data for subsets of users.

**Why it happens:**
Ad-blockers and privacy features block Sentry CDN or ingestion endpoints.

**How to avoid:**
Recommend bundling SDK via npm and support `tunnel`/`tunnelRoute` guidance. Provide a health-check helper to detect blocked transport.

**Warning signs:**
Gaps in user coverage; repeated “SDK not sending any data” reports; errors only from some browsers.

**Phase to address:**
Phase 3 — Production hardening + docs.

---

### Pitfall 8: Third-party promise libraries break unhandled rejection capture

**What goes wrong:**
Unhandled rejections aren’t captured because global handlers are disabled or custom promise implementations bypass them.

**Why it happens:**
Some promise libraries or wrappers alter global rejection handling; Sentry docs warn about third-party promise libraries.

**How to avoid:**
Document how Try interacts with unhandled rejections and recommend manual capture hooks when global handlers are disabled.

**Warning signs:**
Missing errors that should be uncaught; only manually reported errors appear.

**Phase to address:**
Phase 2 — Adapter guidance + docs.

---

### Pitfall 9: Adapter takes ownership of Sentry initialization

**What goes wrong:**
Library initializes Sentry itself, causing conflicts with app-level SDK config, integrations, and sampling.

**Why it happens:**
Library authors try to “make it easy” by hiding SDK initialization.

**How to avoid:**
Expose a pure adapter that accepts an already-initialized client or a `captureException` function. Document that the host app owns initialization.

**Warning signs:**
Reports of lost breadcrumbs or unexpected integrations; incompatible sampling behavior.

**Phase to address:**
Phase 2 — Adapter contract design.

---

### Pitfall 10: Late SDK init breaks capture accuracy

**What goes wrong:**
Errors occur before Sentry is initialized; traces and errors are missing or incomplete.

**Why it happens:**
Performance concerns lead to lazy init; Next.js docs warn about accuracy loss when delaying init.

**How to avoid:**
Recommend early init; if lazy-loading, document tradeoffs and provide opt-in configuration with clear warnings.

**Warning signs:**
Issues only captured after user interaction; missing early-load exceptions.

**Phase to address:**
Phase 2 — Adapter docs + examples.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Let `report()` accept `unknown` without normalization | Easier API | Noisy “Non-Error exception” events, poor grouping | Never |
| Hide Sentry init inside library | Quick setup | Conflicts with app config; hard to debug | Never |
| Skip release/source map guidance | Faster docs | Unreadable stack traces; trust loss | MVP only, with explicit TODO |
| Single adapter for all runtimes | Less code | Incorrect behavior in Next.js edge/server/client | Only if runtime detection is proven and tested |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Next.js | Multiple Sentry instances capture same error | Single ownership; avoid creating clients in library; follow multiple-instance guidance |
| Browser | DSN not exposed in bundle | Document env prefix rules and allow runtime injection |
| Sentry filtering | Rely on server-side inbound filters only | Use `beforeSend`/`ignoreErrors` client-side to reduce noise |
| Source maps | Release mismatch/duplicate release values | Align release values with Sentry bundler plugin behavior |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Eager, heavy Sentry init in all entrypoints | Slower build/runtime; duplicated hooks | Document minimal init per environment; avoid double init | At scale or during SSR-heavy builds |
| Excessive per-error serialization in `report()` | High CPU on hot paths | Keep normalization lightweight; optional enrichers | High-throughput services |
| Unbounded error reporting | Noisy issue stream, quota limits | Provide sampling/filters guidance | After first production traffic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sending sensitive data in error context | PII leakage | Provide redaction helpers in `report()`; document `beforeSend` sanitization |
| Exposing DSN in server-only contexts | Misconfiguration and unintended data flow | Distinct DSN config per runtime; explicit adapter wiring |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `report()` silently mutates error data | Confusing debugging | Make mutation explicit; return new value and document |
| Confusing naming (`try.report` vs `try.catch`) | Misuse of API | Consistent naming + examples per runtime |

## "Looks Done But Isn't" Checklist

- [ ] **Sentry reporting:** Works in node, browser, and Next.js client/server/edge — verify with runtime-specific tests.
- [ ] **Source maps:** Uploaded and matched to releases in production CI — verify stack traces are readable.
- [ ] **Noise control:** `beforeSend`/`ignoreErrors` examples included — verify low-value errors are filtered.
- [ ] **Try semantics:** Errors don’t disappear unless explicitly unwrapped — verify with integration tests.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Silent error swallowing | HIGH | Add `tapError`/`inspectError`, update docs, add migration guide, notify users |
| Duplicate events | MEDIUM | Add dedupe tags/fingerprints; update adapter to avoid double init |
| Source map mismatch | MEDIUM | Align release values; re-upload maps; document CI steps |
| Non-Error exceptions | LOW | Add normalization helper and deprecate raw `unknown` inputs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Silent error swallowing | Phase 1 — Core API semantics | Tests show errors propagate when expected |
| Duplicate events across runtimes | Phase 2 — Adapters/entrypoints | No duplicate issues for same error in Next.js |
| Tree-shaken init | Phase 2 — Packaging/docs | Example app reports events in prod build |
| DSN exposure mistakes | Phase 2 — Adapter docs | Browser events appear with env-prefix config |
| Non-Error exceptions | Phase 1 — Type design | No “Non-Error exception” in test suite |
| Source map/release mismatch | Phase 3 — Build pipeline | Stack traces are readable in Sentry |
| Ad-blocker blocking | Phase 3 — Hardening | Tunnel config test passes |
| Third-party promise capture | Phase 2 — Integration guidance | Unhandled rejections reported in sample app |
| Library-owned Sentry init | Phase 2 — Adapter contract | Host app controls sampling/integrations |
| Late init accuracy loss | Phase 2 — Adapter docs | Errors before app mount are captured |

## Sources

- https://docs.sentry.io/platforms/javascript/troubleshooting/ (Sentry JS troubleshooting)
- https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/ (Next.js troubleshooting, sideEffects warning)
- https://docs.sentry.io/platforms/javascript/guides/nextjs/best-practices/multiple-sentry-instances/ (multiple clients guidance)
- https://docs.sentry.io/platforms/javascript/configuration/filtering/ (beforeSend/ignoreErrors guidance)
- https://docs.sentry.io/platforms/javascript/sourcemaps/ (source map setup)
- https://sentry.zendesk.com/hc/en-us/articles/24672956518043--NextJS-Why-do-I-see-duplicate-or-unknown-releases (release duplication guidance)

---
*Pitfalls research for: TypeScript Try-style error-handling library + Sentry adapters*
*Researched: 2026-01-30*
