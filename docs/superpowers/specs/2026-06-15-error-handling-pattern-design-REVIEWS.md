---
artifact: docs/superpowers/specs/2026-06-15-error-handling-pattern-design.md
reviewers: [gemini, codex, grok]
reviewed_at: 2026-06-15
verdicts:
  codex: "HIGH risk — do not approve as written"
  gemini: "MEDIUM"
  grok: "MEDIUM"
clis: "gemini (gemini-cli), codex (codex exec), grok (grok --prompt-file)"
---

# Cross-AI Design Review — error-handling report-once spec

Three independent models reviewed the hardened spec. The core idea (ALS collector, collect-at-terminal, assemble-at-boundary, one event per root) is judged sound and implementable by all three, but **codex withholds approval** and gemini/grok rate MEDIUM risk because correctness leans on async discipline + deployment conventions rather than local invariants. Below is the synthesized consensus; full per-model reviews follow.

## Consensus Summary

### Agreed strengths (2+ reviewers)
- Identity-based root de-dup and provider injection mirroring `setDefaultReporter` are the right shapes (gemini, grok, codex).
- Terminal-anchored collection matches today's "report at `value()`/`unwrap()`" surface; `error()`/`result()` non-reporting (grok, codex).
- Breadcrumb collect-then-flush fixes a real cross-request leak (gemini, grok).
- Leaf-by-reference + leaf stack on wrappers avoids `Try` frames in Sentry (gemini, grok).
- One-event-per-distinct-root (not one mega-error) is correct (codex, implicit others).

### Agreed concerns (ranked by severity × agreement)

1. **Per-entry-bundle fragmentation → adopt a `globalThis` registry. [HIGH — all 3]**
   `splitting:false` inlines a `Try` per entry; `Try.scopeProvider`/`defaultReporter` are per-bundle. Mixing `/node` + `/nextjs` in one realm = two ALS instances = duplicate reports. Spec documents it as a constraint; reviewers say *fix it*: store provider+reporter on `globalThis[Symbol.for('@power-rent/try-catch')]`.

2. **Late / fire-and-forget / sync-boundary nested work is silently lost or double-emits. [HIGH — codex, grok; MEDIUM gemini]**
   Nested `Try`s that settle after the boundary flushes collect into a dead, cleared scope (lost) or run with no store and become a new boundary (duplicate). "Unsupported" must not mean "silently suppressed." Needs a `flushed/closed` flag and a defined late-collection behavior (direct-report-once or dev warn).

3. **Assembly drops pre-existing application `cause` chains. [HIGH — codex]**
   Choosing the *deepest-walked root* as the leaf discards a meaningful outer domain error that already carried its own `.cause`. Fix: group by deepest-root **for de-dup only**; emit the **innermost collected original error (with its native cause chain intact)** as the leaf, wrapping layer messages above it.

4. **error-like roots defeat `===` de-dup — common, not rare. [HIGH — grok]**
   `errorFromErrorLike` builds a *new* `Error` per layer for `{name,message,code}` throwables (GraphQL/HTTP shapes). Different identities each layer → de-dup misses → duplicate events for a common case. Needs a fallback grouping key (original `cause` identity, or `name+message+code`).

5. **Breadcrumbs-only usage (`.breadcrumbs().value()` without `.report()`) regresses on the collector path. [HIGH grok / MEDIUM codex]**
   Today failure adds breadcrumbs even without `.report()` (tested). Spec only collects breadcrumb data when `message` is set → silent regression on node/nextjs. Preserve it (collect breadcrumbs even without message; attach at flush) or explicitly deprecate + warn.

6. **`.report()` + `error()`/`result()` suppression is a footgun. [MEDIUM — gemini, grok]**
   `.report()` signals "surface this," but a non-collecting terminal drops it. A boundary that fails with `.report()` but inspects via `error()` emits nothing. Decide: decouple "report" from "how the value is returned" (always contribute when `.report()` set) vs keep inspection terminals fully silent.

7. **Sentry `linkedErrors` depth truncation (~5). [MEDIUM/LOW — all 3]**
   Deep chains truncate; root may be cut. Document/recommend `linkedErrorsIntegration({ limit })`; de-dup keeps chains shorter.

8. **Breadcrumb leak fix incomplete + `Reporter.capture` is a breaking API + reporter failures can break never-throws. [MEDIUM — codex]**
   `capture()` calling `Sentry.addBreadcrumb()` still mutates global scope → use `withScope`/event-processor (expand `SentryLike`). `Reporter` is exported → adding a required `capture` breaks third-party implementers; make it optional-with-fallback or major-version. Wrap `capture()` in try/catch so a failed Sentry call can't break `.value()` or block other roots.

9. **Next.js static import of a node-only ALS provider can break Edge/client bundles. [HIGH — codex]**
   `src/nextjs/index.ts` is shared (server+edge+client), `platform:'neutral'`, no export conditions. A top-level `import` of the ALS provider pulls `node:async_hooks` into Edge/client *before* any runtime guard. Needs lazy/conditional import or server-only export condition + a build test.

10. **The "tag-as-hint bug" (D4) is probably NOT a bug. [MEDIUM — codex; noted grok]**
    Installed `@sentry/core` types: `captureException(error, hint?)` accepts a capture-context where `tags` is a valid key. Verify against pinned peer versions before preserving or "fixing" anything.

### Divergent views
- **Boundary model.** All three independently propose moving away from implicit "outermost `Try` wins": gemini → explicit `Try.scope(fn)`; grok → mandatory ingress `reportingScope.run(...)` + `Try` only appends (boundary races disappear); codex → `WeakSet` "first-reporter-wins" (simplest, but loses outer-layer context) **or** explicit `Try.boundary()`. Trade-off: implicit = zero user wiring but fragile; explicit = one wrapper at entry, far easier to verify.
- **Overall risk:** codex HIGH (correctness + compat), gemini/grok MEDIUM (drops to LOW with the `globalThis` fix + entry helper).

### Recommended spec changes (pre-implementation)
Fold in (clear wins): `globalThis` registry; `flushed/closed` idempotency + defined late-collection; preserve original cause chains (leaf = innermost original error); error-like de-dup fallback key + cycle guard; preserve breadcrumbs-only behavior; `withScope`-based tag/breadcrumb isolation; `capture()` try/catch; optional `Reporter.capture`; lazy/server-only ALS import for nextjs; verify (don't assume) the tag-as-hint behavior; document linkedErrors limit. **Decide:** (a) boundary model — keep hardened-implicit vs add explicit entry API; (b) `.report()` + inspection-terminal semantics.

---

## Gemini Review

This is a sophisticated design that leverages Node.js `AsyncLocalStorage` (ALS) to solve the "Sentry noise" problem—a common pain point in nested architectures. The approach to identity-based deduplication and the move from "live" breadcrumbs to "collected" breadcrumbs are particularly strong.

However, the design contains a significant architectural risk regarding **entry-bundle fragmentation** and some subtle "leaks" in how it handles synchronous vs. asynchronous boundaries.

---

### 1. Summary
The design is **sound and implementable**, provided the consumer adheres to strict "one entry-point" packaging. It correctly identifies ALS as the only viable way to track "boundary-ness" without requiring users to pass context objects manually. The assembly algorithm is clever, specifically the use of object identity (`===`) for root-cause grouping, which is the most robust way to handle bubbling errors in JavaScript.

---

### 2. Strengths
*   **Identity-based Deduplication:** Grouping by `error.cause` identity (Section 5.1) is the "correct" way to handle the same error object passing through multiple `Try` layers. It prevents the need for fragile string matching.
*   **Breadcrumb Isolation:** Moving from `Sentry.addBreadcrumb` (global/mutative) to a collected, terminal-anchored model (Section 6) fixes a major "cross-request leak" bug common in Next.js/Node environments.
*   **Stack Integrity:** Manually copying the `leaf.stack` to wrapper `Error` objects (Section 5.2) ensures that Sentry's top-level view remains actionable and isn't polluted by library-internal frames (`Try.ts`).
*   **Graceful Degradation:** The `NoopScopeProvider` ensures that the library remains compatible with Browser/Edge environments without needing complex polyfills.

---

### 3. Concerns

#### **HIGH SEVERITY: Static Registry Fragmentation**
*   **Issue:** Section 7.1 notes that `Try.scopeProvider` is a static property on a class that is **inlined** into every entry bundle (`/node`, `/nextjs`, etc.).
*   **Risk:** In a complex project (especially Next.js), it is highly common to have one file import from `@power-rent/try-catch/node` and another from `/nextjs`. Because these are separate bundles with `splitting: false`, you will end up with **two different ALS instances**.
*   **Failure:** A `Try` from the `/nextjs` entry will not "see" a scope opened by a `Try` from the `/node` entry. You will get duplicate reports, breaking the core promise of the spec.
*   **File Impact:** `src/core/Try.ts` (static initialization).

#### **MEDIUM SEVERITY: The "Zalgo" Sync/Async Boundary Leak**
*   **Issue:** Section 4.8 admits that a **sync boundary** flushes before **async children** settle.
*   **Risk:** This is a silent failure. A developer might wrap a route in a sync `Try` (thinking it's just a wrapper) and then call several async functions inside. If those async functions use `.report().default()`, their errors will be **lost entirely** because the sync boundary flushes an empty scope and closes it before the promises resolve.
*   **Failure:** This violates "Problem 1: Errors not reported."

#### **MEDIUM SEVERITY: Silent Failures in `error()`/`result()` Terminals**
*   **Issue:** Section 4.5 states these are "non-collecting."
*   **Risk:** If a nested `Try` uses `.report('Critical DB fail').error()`, the developer explicitly asked for a report, but the spec suppresses it because it's an "inspection terminal."
*   **Conflict:** This contradicts the "Recovery rule" (Section 9) which says `.report()` is the signal that something is "abnormal." If I report it, I expect an event, even if I handle the error object locally via `.error()`.

#### **LOW SEVERITY: Sentry `linkedErrors` Depth**
*   **Issue:** Section 5 proposes building a nested `cause` chain.
*   **Risk:** Sentry (and some Node versions) have limits on `cause` depth or linked error displays (typically 5-10). In a deeply nested architecture, the "root" (the most important part) might be truncated.
*   **File Impact:** `src/adapters/createSentryReporter.ts`.

---

### 4. Suggestions
1.  **Use `globalThis` for the Registry:** To fix the fragmentation concern, `Try.setScopeProvider` should store the provider on a `Symbol.for('@power-rent/try-catch/scope-provider')` on `globalThis`. This ensures that even if multiple bundles are loaded, they share the same ALS instance and reporter.
2.  **Warn on Sync Boundary + Async Store:** In `execute()`, if the current `Try` is a boundary and is synchronous, but `provider.getStore()` eventually detects pending async operations (hard to detect) OR simply **require the boundary to be async** if children are async. At minimum, add a development-mode `console.warn` if a sync boundary completes while the scope still has "unsettled" activity.
3.  **Make `.report()` Override Terminal Choice:** If `.report()` was called on a `Try` instance, it should *always* contribute to the scope, even if the terminal used was `.error()` or `.result()`. The decision to *report* should be decoupled from the decision of how to *return* the value to the caller.

---

### 5. Simpler alternative?
**The "Explicit Collector" Pattern.**
Instead of ALS, use an explicit `Try.scope(() => { ... })` wrapper. 
*   **Pros:** No "magic" boundary detection; works in Browser/Edge (if using a simple object reference); much easier to debug.
*   **Cons:** Requires changing user code to add the `Try.scope` wrapper at entry points.
*   **Verdict:** The ALS approach is better for a library aiming for "invisible" utility, but the `globalThis` fix is mandatory to make it robust.

---

### 6. Risk Assessment
**Overall Risk: MEDIUM**

**Justification:**
The implementation of ALS is surgically isolated from the core (good), but the **bundling constraints** (Section 7.1) create a high probability of "it works in dev, fails in prod" scenarios where multiple bundles prevent deduplication. Additionally, the silent loss of errors in sync boundaries (Section 4.8) is a foot-gun for developers used to the "always reports" guarantee of the current library. If the `globalThis` registry is implemented, the risk drops to **LOW**.


---

## Codex Review

## Summary

Do **not** approve as written. The ALS collector is plausible and implementable, but the spec overstates “exactly once” and “byte-for-byte unchanged” while leaving concrete lost-report races, Next.js bundling hazards, breadcrumb semantic changes, and Sentry behavior assumptions unresolved. The design can be hardened, but it needs a closed/flushed scope lifecycle, a safer Next.js server-only injection story, and clearer decisions around breadcrumbs, tags, and existing `cause` chains before implementation.

## Strengths

- Provider injection keeps core browser-safe if `node:async_hooks` stays out of core and browser entries.
- Boundary detection at first live `execute()` is the right place because execution is cached at [src/core/Try.ts:787](/Users/wolf/sources/try-catch/src/core/Try.ts:787).
- Terminal-anchored collection matches today’s reporting surface: `unwrap()` and `value()` report, while `error()` and `result()` do not, at [src/core/Try.ts:560](/Users/wolf/sources/try-catch/src/core/Try.ts:560), [src/core/Try.ts:651](/Users/wolf/sources/try-catch/src/core/Try.ts:651), [src/core/Try.ts:688](/Users/wolf/sources/try-catch/src/core/Try.ts:688), and [src/core/Try.ts:732](/Users/wolf/sources/try-catch/src/core/Try.ts:732).
- Capturing the scope on the instance is better than calling `getStore()` later from terminal continuations.
- One event per distinct root is the right target; independent sibling failures should not be collapsed into one artificial mega-error.
- The spec correctly notices the per-entry static problem caused by `splitting: false` at [tsup.config.ts:67](/Users/wolf/sources/try-catch/tsup.config.ts:67) and separate exports in [package.json:14](/Users/wolf/sources/try-catch/package.json:14).

## Concerns

- **HIGH:** Late nested work can be silently lost. If a nested async `Try` inherits the ALS scope but settles after the boundary flushes and clears `scope.errors`, it will still “collect” into a dead scope instead of emitting. The spec documents fire-and-forget as unsupported, but unsupported should not mean suppressed forever.
- **HIGH:** The spec needs an explicit `closed/flushed` flag. Current instances can have multiple terminals because execution is cached, and tests already call multiple terminals on one instance at [src/__tests__/flexible-breadcrumbs.test.ts:556](/Users/wolf/sources/try-catch/src/__tests__/flexible-breadcrumbs.test.ts:556). Clearing the array is not enough to prevent late or repeated flush logic.
- **HIGH:** Next.js injection is underspecified and risky. `src/nextjs/index.ts` is a shared entry today, package exports have no server/client condition at [package.json:20](/Users/wolf/sources/try-catch/package.json:20), and `tsup` uses `platform: 'neutral'` at [tsup.config.ts:68](/Users/wolf/sources/try-catch/tsup.config.ts:68). A static import of a node-only ALS provider can break Edge/client bundles before a runtime guard runs.
- **HIGH:** “Run finally callback to completion” conflicts with sync return preservation. Sync execution calls `runFinallyCallback()` but cannot await a returned Promise without changing return types at [src/core/Try.ts:839](/Users/wolf/sources/try-catch/src/core/Try.ts:839); async finally callbacks are allowed at [src/core/Try.ts:849](/Users/wolf/sources/try-catch/src/core/Try.ts:849).
- **HIGH:** The assembly algorithm drops pre-existing application cause chains. Grouping by deepest root is fine, but emitting only that deepest root as the leaf loses an outer domain error that already had `cause`. Current normalization deliberately preserves `cause` and custom fields at [src/core/Try.ts:99](/Users/wolf/sources/try-catch/src/core/Try.ts:99).
- **MEDIUM:** Breadcrumb compatibility is misstated. Today `value()` adds breadcrumbs even without `.report()` on failure at [src/core/Try.ts:745](/Users/wolf/sources/try-catch/src/core/Try.ts:745) and [src/core/Try.ts:767](/Users/wolf/sources/try-catch/src/core/Try.ts:767), and tests assert that at [src/__tests__/flexible-breadcrumbs.test.ts:25](/Users/wolf/sources/try-catch/src/__tests__/flexible-breadcrumbs.test.ts:25). Collector-only breadcrumbs would change Node/Next.js behavior.
- **MEDIUM:** Breadcrumb leak fix is incomplete if `capture()` just calls `Sentry.addBreadcrumb()` before capture. That still mutates Sentry scope; use `withScope`/temporary scope or an event processor. Current `SentryLike` only exposes `captureException` and `addBreadcrumb` at [src/adapters/createSentryReporter.ts:8](/Users/wolf/sources/try-catch/src/adapters/createSentryReporter.ts:8).
- **MEDIUM:** Adding `Reporter.capture` is a public TypeScript breaking change because `Reporter` is exported at [src/core/reporter.ts:15](/Users/wolf/sources/try-catch/src/core/reporter.ts:15) and [src/index.ts:8](/Users/wolf/sources/try-catch/src/index.ts:8).
- **MEDIUM:** Reporter failures can break the “never throws” contract of `.value()`. Current reporting is unguarded at [src/core/Try.ts:873](/Users/wolf/sources/try-catch/src/core/Try.ts:873); flush should isolate capture failures per root.
- **MEDIUM:** The “tag-as-hint bug” premise looks stale for the installed Sentry SDK. `captureException` accepts an event hint or capture context at [node_modules/@sentry/core/build/types/exports.d.ts:10](/Users/wolf/sources/try-catch/node_modules/@sentry/core/build/types/exports.d.ts:10), and `tags` is a capture-context key at [node_modules/@sentry/core/build/types/types-hoist/scope.d.ts:15](/Users/wolf/sources/try-catch/node_modules/@sentry/core/build/types/types-hoist/scope.d.ts:15). Test actual peer versions before preserving a workaround.
- **MEDIUM:** Deep linked-error chains may be truncated unless users configure Sentry’s linked errors integration; the SDK exposes `linkedErrorsIntegration({ limit })` at [node_modules/@sentry/core/build/types/integrations/linkederrors.d.ts:1](/Users/wolf/sources/try-catch/node_modules/@sentry/core/build/types/integrations/linkederrors.d.ts:1).
- **LOW:** Boundary tags do not apply when the boundary uses `error()` or `result()` because those terminals are non-collecting. That weakens “boundary wins” for request-level tags.
- **LOW:** “Byte-for-byte unchanged” is too strong. Core code and exported types will change even if browser/bare runtime behavior remains equivalent.

## Suggestions

- Add `Scope.closed`, `Scope.flushed`, and an idempotent `flushBoundary(scope)`; late collection after close should either direct-report once or produce a debug warning, never silently append.
- Wrap every `capture()` in `try/catch/finally`; one failed Sentry call must not prevent clearing the scope or reporting other roots.
- Do not statically import `node:async_hooks` from the shared Next.js entry. Prefer a server-only entry/condition, or prove with build tests that Edge and client imports do not include the node provider.
- Preserve existing application cause chains: group by deepest root for dedup, but assemble library message wrappers around a representative original error chain, not only the deepest leaf.
- Decide explicitly whether no-report breadcrumbs remain supported in Node/Next.js. If not, call it a breaking behavior change and update tests/docs.
- Expand the Sentry adapter surface to use `withScope`, `scope.addBreadcrumb`, and `scope.setTags`, or keep capture-context tags after verifying peer versions.
- Make `Reporter.capture` optional with a fallback, or ship this as a major version because custom reporters will fail type checking.
- Add tests for concurrent terminals on one instance, late fire-and-forget nested `Try`, sync function plus async `finally`, existing `Error.cause` chains, disabled/low-limit linked errors, and importing `/nextjs` in client/Edge-like builds.

## Simpler Alternative?

Yes: a root-level `WeakSet`/`WeakMap` “first reporter wins” deduper is materially simpler. Each collecting terminal finds the deepest root error, reports immediately only if that root has not been reported, and records the root in a `WeakSet`. This meets always-report, per-operation recovery, and one-event-per-root-failure without ALS or await-discipline loss. The tradeoff is real: it cannot wait for outer layers, so the single event may lack outer contextual messages. If the nested cause-chain goal is mandatory, keep ALS but consider an explicit `Try.boundary()` API instead of implicit outermost detection.

## Risk Assessment

**HIGH.** The core idea is viable, but as specified it can lose reports, break Next.js client/Edge imports, change breadcrumb behavior, and drop existing cause-chain context. These are correctness and compatibility risks, not just implementation details.


---

## Grok Review

Grounding the review in the codebase — reading the core implementation and related files.
## 1. Summary

The design is **directionally sound and implementable** against the current `Try` shape: ALS boundary wrapping in `execute()`, terminal-anchored collection, and a `capture()` path map cleanly onto `Try.ts:787–902` and `createSentryReporter.ts:21–51`. The spec has clearly been hardened against real code (cache short-circuit at `788–796`, async `finally` chaining at `819–822`, `toError` identity at `148–156`, per-bundle statics per `tsup.config.ts:67`). Remaining risk is not the core nested-await happy path but **operational footguns**: implicit boundary selection, timer/microtask context timing, error-like dedup identity, breadcrumbs-only usage regressions on the collector path, and undocumented flush-idempotency. Those can produce duplicate events, silent loss, or behavior drift without breaking tests if coverage stays single-layer heavy.

---

## 2. Strengths

- **Clean separation of concerns**: `ScopeProvider` injection mirrors `setDefaultReporter` (`Try.ts:197–206`); core stays free of `node:async_hooks`; browser/core legacy path is explicitly gated.
- **Boundary model matches ALS semantics**: wrapping only the user fn in `provider.run()` preserves sync/async classification (`Try.ts:801`) and lets ALS propagate across `await` inside the boundary fn.
- **Captured `this.scope`**: avoids re-deriving store at terminal time; correct given terminals run outside `run()` but share the scope object reference.
- **Terminal-anchored collection**: aligns with today’s “report at `value()`/`unwrap()`” contract (`Try.ts:745–768`, `566–594`) while enabling nested suppression.
- **Non-collecting terminals flush nested**: `error()`/`result()` still draining nested reports (`§4.6`, `§8`) fixes the “recovered inner + inspecting outer” hole without forcing outer `.report()`.
- **Assembly preserves leaf fidelity**: reusing the root `Error` by reference and copying leaf stack onto wrappers matches today’s `createWrappedError` (`createSentryReporter.ts:22–26`, `reporter.ts:52–56`) and avoids `Try` frames in Sentry stacks.
- **Breadcrumb cross-request leak fix**: deferring `addBreadcrumbs` until `capture()` addresses the live-scope pollution described in `Try.test.ts:1817–1843` and `Try.ts:887–901`.
- **Honest limitations**: sync-boundary/async-nested, fire-and-forget, Edge fallback, and per-entry-bundle constraint (`§7.1`, `tsup.config.ts:67`) are documented rather than hand-waved.
- **Backward-compat anchor**: standalone un-nested `Try` remains its own boundary → existing `toHaveBeenCalledTimes(1)` tests should survive.

---

## 3. Concerns

- **HIGH — Error-like roots defeat `===` dedup (understated in spec).** `toError` reconstructs non-`instanceof Error` throwables via `errorFromErrorLike`, producing a **new** `Error` per layer (`Try.ts:99–132`, `152–154`). Two layers catching the same plain `{ name, message, code }` object get different reconstructed roots; `error.cause` is the original object, not an `Error`, so the “walk to deepest `Error`” rule stops at different identities. This is common for GraphQL/HTTP error shapes — worse than the spec’s “cross-realm” caveat (`§5`).

- **HIGH — Fire-and-forget / deferred nested terminals lose reports or double-emit.** Boundary flush runs when the boundary terminal settles (`§4.6–4.7`), after the boundary fn returns. Nested `Try`s not awaited in the boundary fn (`void inner.value()`, un-awaited promise, or work that settles after boundary terminal) either miss the flush window or run with `getStore() === undefined` and become a **new boundary** → duplicate Sentry events. `§12` documents this but underestimates prevalence in real Next.js/server code (detached promises, `eventEmitter`, fire-and-forget side effects).

- **HIGH — Breadcrumbs-only failures silently disappear on collector path.** Today `.breadcrumbs(...).value()` without `.report()` still calls `addBreadcrumbsIfConfigured` (`Try.ts:747–748`, `767–770`). The spec disables live breadcrumbs on the collector path and only stores breadcrumb data inside `Collected` when `config.message` is set (`§4.5`, `§6`). Node/Next consumers using breadcrumbs as the sole observability signal will regress with no compile-time warning.

- **MEDIUM — No explicit flush-once guard on boundary instances.** Collection gets a `collected` flag (`§4.5`), but flush idempotency relies on “clear scope after flush.” A boundary that flushes, then receives a **late** nested collection into the same cleared-but-mutated `scope.errors` array (same object reference held by late nested `Try`) could emit twice. Unlikely in well-structured code; possible with timers/microtasks.

- **MEDIUM — Implicit boundary is fragile ergonomics.** “Outermost `Try` in the async context tree” (`§9`) means missing a route/job wrapper silently reduces dedup to per-subtree behavior. No runtime signal when `func1 → func2 → func3` spans modules and only mid-stack layers use `Try`.

- **MEDIUM — `throwThroughErrorTypes` reporting invariant is untested today.** `Try.test.ts:399–408` asserts rethrow shape only, not `captureException`. The spec’s D3 depends on collection happening before ignore-based rethrow (`Try.ts:566–582`), but a refactor could drop “report when collected” without test failure until multi-layer tests land.

- **MEDIUM — Sentry linked-exception depth / shape not validated.** Assembly builds arbitrarily deep `head.cause → … → leaf` chains (`§5`). Sentry’s `linkedErrors` integration truncates beyond a configurable depth (commonly ~5). Deep middleware stacks may show truncated chains with no spec guidance on `maxValueLength` / `LinkedErrors` options.

- **MEDIUM — Tag folding vs today’s per-layer semantics change.** Collector path merges all layer tags into one event (`§5.3`). Today each layer would have emitted its own tag set. Inner/outer conflicts resolved “boundary wins” — correct for single event, but changes dashboards/alerts that assumed per-layer tag isolation.

- **MEDIUM — Per-entry-bundle duplication (`§7.1`).** `splitting: false` (`tsup.config.ts:67`) means two imports (`/node` + `/nextjs`) in one server realm → two ALS instances, two `Try` classes, split collection. Easy monorepo footgun; constraint is documented but not enforceable.

- **MEDIUM — `error()`/`result()` boundary on a failing boundary with `.report()`.** Outer failure is intentionally not collected (`§4.5`), only nested flushed. If inner recovers and outer fails without a nested report, you get **no event** despite outer `.report()` — surprising relative to “errors always reported” (`§2` goal 3) unless doctrine is “`.report()` + non-collecting terminal = opt out.”

- **LOW — D4 deferred: tags likely still no-ops in Sentry.** `createSentryReporter.ts:35–37` passes tags as `captureException` hint; spec preserves this in `capture()`. Report-once works; tag correctness does not.

- **LOW — `Reporter` ecosystem break.** Third-party `Reporter` implementations need new `capture()`; only mentioned in checklist, not semver/API note.

- **LOW — Assembly copies leaf stack to every wrapper.** Sentry UI may show identical stacks on each linked frame (`§5`). Cosmetic but noisy.

- **LOW — Root walk assumes `cause instanceof Error` chain.** Errors with cyclic `cause` (pathological) could loop; no guard in assembly pseudocode.

---

## 4. Suggestions

1. **Strengthen root grouping key**: after walking `Error` causes, fall back to `error.cause` identity (or `name+message+code`) when the leaf is a reconstructed error-like wrapper. Aligns with `errorFromErrorLike` (`Try.ts:127–128`) and fixes the most likely dedup miss.

2. **Add `flushed: boolean` on boundary instances** alongside `collected`; make flush a no-op if already flushed even if `scope.errors` is mutated afterward.

3. **Preserve breadcrumbs-only behavior on collector path**: if `breadcrumbConfig` is set and terminal is collecting, push breadcrumb data into `Collected` (or a parallel scope buffer) even without `message`, and attach at flush — or explicitly error/warn when `.breadcrumbs()` is used without `.report()` on node/nextjs.

4. **Ship a first-class entry helper**, e.g. `Try.entry(fn, ...args)` or documented `runWithReporting(() => …)` that establishes the boundary at HTTP/job ingress — reduces reliance on “someone wrapped the route.”

5. **Add regression tests before implementation** for: (a) error-like object thrown through 3 layers → 1 event; (b) `setTimeout(0)` nested after boundary return → documents actual Node ALS behavior; (c) `result()` then `value()` on same instance; (d) `throwThroughErrorTypes` + `capture()` called; (e) breadcrumbs-only `.value()` on nextjs entry; (f) 6+ layer cause chain vs Sentry depth.

6. **Document terminal matrix explicitly** for `.report()` + `error()`/`result()` on boundary failure (silent outer) vs nested-only flush.

7. **Lint/import guard** for dual entry usage in server apps (optional static rule: don’t import both `/node` and `/nextjs` in the same package).

8. **In `capture()`, add optional `fingerprint` or `event_id` seed from root identity** to help Sentry merge if dedup fails.

9. **Clarify tag merge order in §5.3** with a concrete 3-layer example (today tests at `Try.test.ts:260–387` are single-layer).

---

## 5. Simpler alternative?

**Yes — explicit request scope with a single flush point**, instead of inferring boundary from `getStore() === undefined`.

Sketch:

```ts
// Middleware / route wrapper (once per request)
reportingScope.run({ errors: [] }, async () => {
  return handler(req);
});

// Try changes: always collect on .report() terminals; never auto-flush
// Scope owner flushes explicitly:
reportingScope.flush() // or automatic on scope.run completion via try/finally
```

- **Ingress** opens ALS `{ errors: [] }` exactly once (Next.js middleware, server action wrapper, job runner).
- All `Try` instances **only append** to the active scope on collecting terminals; **never** decide boundary themselves.
- **Flush once** when the scope callback completes (success or failure), assembling per `§5`.
- Nested dedup, cause chains, and breadcrumb deferral are unchanged; **boundary detection and its races disappear**.

Trade-off: requires one wrapper at process/request edge (the spec’s “entry rule” becomes **mandatory API**, not convention). That is simpler mentally and easier to verify than “first `Try` wins.”

A second, even simpler variant: **reporter-side dedup** — pass `rootError` id into `capture()` and keep a `WeakSet` on the active scope; skip if root already emitted. Weaker cause-chain richness, but minimal `Try` churn.

---

## 6. Risk Assessment

**MEDIUM**

The core mechanism (ALS + collect-at-terminal + assemble-at-boundary-flush) is coherent and matches how `Try` already executes and reports. The team has clearly read the code. Risk is elevated because correctness depends on **async discipline and deployment conventions** (entry wrapping, no fire-and-forget, single bundle import) rather than on types or local invariants alone, and because **error-like dedup** and **breadcrumbs-only** paths have concrete regression vectors against `toError` / `addBreadcrumbsIfConfigured` behavior that the spec treats as edge cases. Single-layer parity tests will green while multi-layer production code still duplicates or loses events until the suggested tests and root-grouping hardening land.
