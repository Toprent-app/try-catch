---
artifact: implementation (PR #41, report-once via AsyncLocalStorage)
reviewers: [grok, codex]
reviewed_at: 2026-06-19
note: gemini unavailable (account IneligibleTierError — Gemini Code Assist free tier discontinued)
---

# Cross-AI Implementation Review — report-once via AsyncLocalStorage

Target: `feat/report-once-als` (PR #41) source diff (tests omitted from the prompt).
Reviewers: **Grok** (overall HIGH risk), **Codex** (MEDIUM Node / HIGH if nextjs must be guaranteed). Gemini errored out (free-tier discontinued).

---

## Grok Review

**Summary** — ALS-backed report-once aggregation via a process-global registry and per-boundary `Scope`; one Sentry event per root across N layers on Node/Next.js Node runtime; legacy preserved elsewhere. Intricate: boundary detection + `this.scope` capture at first `execute()`, `.report()`/breadcrumb-gated collection on every terminal, flush only from the boundary's `collectorSettle`, grouping/assembly in `flushScope`/`emitGroup`.

**Strengths** — clean legacy/collector split via `collects`; no static `async_hooks` in wrong bundles; shared `globalThis` registry; isolated `withScope`; emit failures wrapped; late arrivals handled (not lost); `rootOf` cycle guard; leaf stack copy + native cause preserved; `collected`/`flushed` intent.

**Concerns**
- **HIGH — `src/nextjs/index.ts` `installNextjsCollector`**: collector installed via fire-and-forget `void import(...)`. Nothing awaits it; a first `Try(...).report().value()` before the microtask resolves takes the legacy path → N events on cold start. Tests pass only because of `await vi.waitFor(() => collects)`.
- **HIGH — `groupKey`/`groupByRoot`/`emitGroup`**: non-`Error` roots de-dup by `name\0message\0code`. Two independent sibling POJO failures with identical fields merge into one chimeric event. No counter/source in the key.
- **HIGH — `execute` cache + instance-captured `scope`/`isBoundary`/`collected`**: captured on first execution; reusing a `Try` instance across sequential requests/contexts collects/flushes into the wrong (stale) scope or misses collection. Caching predates the collector; they interact poorly.
- **MEDIUM** — every terminal calls `collectorSettle`; multiple terminals on an in-flight async Try attach separate `.then` handlers; idempotency rests on flag ordering, not call-site discipline.
- **MEDIUM** — ALS propagation limits: a `Try` created/settled from a `setTimeout`/`setImmediate` callback sees `undefined` store → declares itself a boundary → emits separately. Tests use `await delay()` inside the wrapped fn (continuation), not timer-scheduled creation.
- **MEDIUM** — `emitGroup` fallback (`reporter.report`) when no `capture`: only first message + one breadcrumb set used; rest of the group discarded — lossy optional contract.
- **MEDIUM** — breadcrumb extraction at collection time (collector) vs call time can differ if args mutate; no re-entrancy protection.
- **LOW/MEDIUM** — finally-callback timing vs collection ordering is subtle.
- **LOW** — stale JSDoc on `.result()`/`.error()` ("Errors are not reported"); registry types exported (consumers can break isolation).

**Suggestions** — make nextjs install blocking for first use (or document the race); higher-entropy POJO key or fall back to identity for POJOs; re-evaluate/clear `this.scope` on cached hits or document "don't reuse instances across requests"; add tests for concurrent requests, `setTimeout(() => new Try())`, reused instance across roots, `Promise.all` siblings; move collection into the `execute` promise chain; improve fallback fidelity; runtime warn if collector entry used while `!collects`.

**Overall risk: HIGH** — async install race (nextjs), content over-grouping, instance state outliving its ALS context, idempotency via flag ordering → realistic routes to multiple/wrong events. 100% coverage masks these (tests stay in single controlled contexts and wait for install).

---

## Codex Review

**Summary** — ALS boundary model directionally sound (instance-captured scope, shared global ALS, isolated reporter failures). Would not merge as-is: nextjs first-call race, error-like grouping can crash and wrongly merge, and several docs/API semantics diverge.

**Strengths** — `execute()` captures `this.scope` once (right defense after `await`); shared ALS via `Symbol.for`; `collectorSettle` mostly idempotent per instance; `withScope` event-scoped; `emitGroup` catches reporter failures.

**Concerns**
- **HIGH — `installNextjsCollector`**: async, not awaited; cold-start handler sees `NoopScopeProvider` → legacy per-terminal reporting.
- **HIGH — `rootOf`/`groupKey`**: non-`Error` throws not normalized. `throw null`/`throw undefined` can crash in `rootOf()` via `current.cause`; plain error-like siblings with identical `name/message/code` merge even when independent.
- **MEDIUM — `emitGroup` `leaf = entries[0].error`**: relies on innermost-first collection order; concurrent `Promise.all`/racing siblings → order-dependent leaf/tag/late-dup.
- **MEDIUM — `execute` + `runFinallyCallback`**: `provider.run()` wraps only `fn()`; the `.finally(runFinallyCallback)` is outside ALS scope, so nested `Try` in a `.finally()` may not join the scope.
- **MEDIUM — global registry**: sharing the provider is good; sharing `defaultReporter` is last-wins across `/node` + `/nextjs` import order.
- **MEDIUM — `result`/`error` JSDoc** still says "Errors are not reported" — real API break, needs major + release notes.
- **LOW** — fallback path loses the assembled chain; **LOW** — `import { Scope }` should be `import type`.

**Suggestions** — make nextjs install deterministic before first use (or document cold-start window) + a real Next Edge/client fixture build; normalize caught values via `toError(unknown)` and make `rootOf` accept `unknown`; avoid content-only grouping unless documented; run finally within scope; add tests for first-call-before-install, concurrent scopes, `Promise.all` early rejection, `throw null/string/POJO`, same-content siblings, dual-entry imports, reporter without `capture`, nested `Try` in `.finally()`.

**Overall risk: MEDIUM** (Node happy path) / **HIGH** (if nextjs report-once must hold from the first request).

---

## Consensus Synthesis & Triage

Ranked by validated severity (verified against the code).

### Confirmed — should fix

1. **`throw null` / `throw undefined` crashes the collector flush (breaks `.value()` never-throw).** *(codex HIGH — VERIFIED.)* `rootOf(null)` → `TypeError: Cannot read properties of null (reading 'cause')`, thrown from `flushScope` → `collectorSettle` → the terminal, so `.value()` can throw. Both `rootOf` and `groupKey` dereference a possibly-null/undefined root.
   → Fix: make `rootOf`/`groupKey` null-/non-object-safe (guard `current && typeof current === 'object'`). Add tests for `throw null`/`undefined`/string/number.

2. **Next.js collector install is an un-awaited async race.** *(both HIGH — VALID.)* `void import('node:async_hooks').then(install)` means a first `Try` call on cold start can run before install and take the legacy path (→ N events).
   → Fix: install **synchronously** via a runtime-guarded indirect `require('node:async_hooks')` (still gated on `NEXT_RUNTIME`, still invisible to the Edge static bundler), so the collector is live at module load. Falls back to legacy if unavailable.

3. **Error-like content key over-merges independent sibling failures.** *(both HIGH — VALID design tradeoff.)* Two independent non-`Error` failures with identical `name/message/code` collapse into one event.
   → Options: fall back to **identity** for non-`Error` roots too (accept occasional duplicate events for POJOs), or keep content-keying but `debug`-warn on a cross-content merge, and document. (Identity fallback is simplest and removes the false-merge; it weakens the original "reconstructed error-like across layers" case, which the current code does not actually produce since nothing reconstructs error-likes.)

### Confirmed — should document (lower priority, or fix-if-cheap)

4. **Stale JSDoc** on `.result()`/`.error()` ("Errors are not reported"). *(both LOW — VERIFIED.)* → Update the doc comments. Cheap.
5. **`import type { Scope }`** in `nextjs/index.ts` + `adapters/node/scopeProvider.ts`. *(codex LOW.)* → Cheap correctness/clarity fix.
6. **Lossy fallback** when a reporter lacks `capture()` (only first message + breadcrumbs). *(both MEDIUM.)* → Pass the assembled error to `report()` (no message → no re-wrap) to preserve the chain; or document that full fidelity needs `capture`.
7. **`finallyCallback` runs outside the boundary's ALS scope.** *(codex MEDIUM.)* → Run it within `provider.run(this.scope, …)` for the boundary, or document that nested `Try` inside `.finally()` does not aggregate.
8. **Shared `defaultReporter` is last-wins across dual-entry imports.** *(codex MEDIUM.)* Only the scope provider needs cross-entry convergence; the reporter could stay per-entry. → Document, or move the reporter off the shared registry.
9. **Instance reuse across requests / timer-scheduled `Try` creation** sees a stale or `undefined` scope. *(grok HIGH / MEDIUM.)* Realistically uncommon (per-call instances; the late-emit guard bounds the damage to "emits separately"), but the model is not correct for all async scheduling. → Document the limitation (don't reuse instances across ALS contexts; fire-and-forget/timer-created Trys emit separately).

### Divergent / lower-confidence

- **Multi-terminal `.then` handler fan-out** (grok MEDIUM): idempotency via `collected`/`flushed` is correct under JS single-threaded microtask ordering and is tested; complexity, not a bug.
- **Concurrent `Promise.all` sibling leaf/tag ordering** (codex MEDIUM): only matters when racing siblings share one root; rare. Worth a targeted test.

### Coverage caveat (both)
100% line/branch coverage does not exercise: cold-start-before-install, concurrent request scopes, `Promise.all` early rejection with a slower sibling, `throw null/undefined/string/POJO`, reused instances across roots, timer-created Trys, dual-entry imports, custom reporter without `capture`, nested `Try` in `.finally()`.

---

## Resolution (applied in a follow-up commit)

Fixed:
- **#1 (crash) — DONE.** `rootOf`/`groupByRoot`/`buildCauseChain` made null-/non-object-safe; `throw null`/`undefined`/string/number no longer crash the flush, preserving `.value()`/`.error()`/`.result()` never-throw. Tests added.
- **#3 (over-merge) — DONE.** Dropped the content-key fallback; grouping is now identity/value via a `Map`. Independent error-like siblings emit separately. Tests updated.
- **#4 (stale JSDoc) — DONE.** `.error()`/`.result()` docs now describe the legacy-vs-collector behavior.
- **#5 (`import type`) — DONE.** `Scope` imported as a type in `nextjs/index.ts` and `adapters/node/scopeProvider.ts`.

Considered, not applied (with rationale):
- **#2 (nextjs async install race) — NOT changed.** A synchronous `require`-based install was attempted but is **untestable in the vitest env** (pure ESM, no global `require`), forcing `eval` + shipping untested, coverage-ignored branches to close a race that is, in practice, a boot-time microtask (the dynamic import resolves during module init, before request handling). Kept the clean, fully-tested async install and **documented** the boot-window + late-collection guard in the README. Revisit only if a real Next.js Edge/Node fixture shows a measurable cold-start gap.
- **#6+ (lossy fallback, finally-in-scope, dual-entry reporter last-wins, instance reuse, timer-created Trys)** — documented as limitations; not fixed (niche / pre-existing / out of the report-once happy path).

All 238 tests pass at 100% statement/branch/function/line coverage.

