# Implementation Plan — report-once via AsyncLocalStorage

Spec: `docs/superpowers/specs/2026-06-15-error-handling-pattern-design.md` (read §4–§7, §10, §14).
Scope: `@power-rent/try-catch`, Node + Next.js (Node runtime) only. Browser / bare-core / Edge unchanged.
Branch: `docs/error-handling-pattern` (spec + reviews committed at `82cfafa`). Implementation should land on its own branch (e.g. `feat/report-once-als`).

## Principles

- **Vertical slices.** Each task delivers one complete, testable path (provider → execute → terminal → reporter), not a horizontal layer. Every slice ends green (`npm test` + `npm run build`).
- **Legacy path is the safety net.** Until an ALS provider is injected, `collects=false` everywhere → today's behavior byte-for-byte. Browser/bare-core never change.
- **Tests ride with their slice.** No "tests later" task.

## Dependency graph

```
T0 types+registry+gate ──┬─► T1 single-Try collector (node) ──► T2 multi-layer nest+assembly ──► T3 robustness/edge-cases
                         │                                                                          │
                         └─────────────────────────────────────────────────► T4 nextjs lazy inject ┘
                                                                                                    │
                                                                          T5 docs + changeset + D4 ─┘
```

- T0 blocks everything (foundation).
- T1 blocks T2 (nesting needs the single-layer pipeline working).
- T2 blocks T3 (edge cases extend assembly/flush).
- T4 (nextjs) depends only on T0+T1 (provider + collector pipeline) — can run parallel to T2/T3.
- T5 (docs/changeset/D4) depends on the observable behavior being final (after T3) and on T4's packaging decisions.

## Checkpoints (human review gates)

- **CP-A** after T0: build green, *all* existing tests pass unchanged (legacy active), no `node:async_hooks` in core.
- **CP-B** after T1: single-Try parity confirmed on `/node`; new emit behavior for `error()`/`result()`+`.report()` shown; breadcrumb event-scoping shown.
- **CP-C** after T2: 1-root×N-layer → 1 event with cause chain + preserved app cause; sibling roots → N events.
- **CP-D** after T4: nextjs Node dedups; Edge/client bundle free of `node:async_hooks`; dual-entry shares one scope.
- **CP-E** after T5: README/contract reversal documented, major changeset, D4 resolved.

---

## T0 — Foundation: types, globalThis registry, path gate (no behavior change)

**Files:** `src/core/Try.ts`, `src/core/reporter.ts`, new `src/core/scope.ts` (types + NoopScopeProvider + registry).

**Work:**
- Define `Collected`, `Scope { errors: Collected[]; flushed: boolean }`, `ScopeProvider { collects; getStore(); run() }` (pure types; no `node:async_hooks`).
- `NoopScopeProvider` (`collects:false`, `getStore:()=>undefined`, `run:(_,fn)=>fn()`).
- `globalThis` registry under `Symbol.for('@power-rent/try-catch/registry')` holding `{ scopeProvider, defaultReporter }`; lazy-init to Noop + existing default reporter. Re-point `Try.setDefaultReporter`/`getDefaultReporter` and add `Try.setScopeProvider`/`getScopeProvider` to read/write the registry (last-wins, idempotent for identical provider).
- Add **optional** `capture?(assembledError, { tags, breadcrumbs })` to the `Reporter` interface. No implementation behavior yet.
- Path gate helper: `usesCollector = registry.scopeProvider.collects` (consumed in T1).

**Dependencies:** none.

**Acceptance criteria:**
- `npm run build` passes; `dist/browser/*`, `dist/index.*` contain no `node:async_hooks` (grep guard).
- All existing tests pass **unchanged** (collector path dormant — no provider injected).
- `Reporter` is structurally back-compatible: existing custom reporters without `capture` still type-check.

**Verification:** `npm test`; `npm run build`; `grep -rl "async_hooks" dist/browser dist/index.* || echo clean`; type-check a stub reporter lacking `capture`.

---

## T1 — Single-Try collector path end-to-end (`/node` entry)

**Files:** `src/core/Try.ts` (execute + terminals + flush + assembly entry), new `src/adapters/node/scopeProvider.ts`, `src/node/index.ts`, `src/adapters/createSentryReporter.ts`, `src/core/reporter.ts` (NoopReporter.capture), new tests.

**Work (vertical, single root, single layer — no nesting yet):**
- ALS provider (`src/adapters/node/scopeProvider.ts`): `AsyncLocalStorage` stored on the globalThis registry; `collects:true`; inject in `src/node/index.ts`.
- `execute()`: at first live execution (after cache guard `Try.ts:788–796`, before `fn` at 799) compute `isBoundary = getStore()===undefined`; capture `this.scope`; boundary wraps `provider.run(scope, () => fn(...args))` (returns synchronously — preserve `isPromiseLike` at 801).
- Collection (`.report()`-gated, all terminals, once per instance via `collected` flag): on failure branch of `value`/`unwrap`/`error`/`result`/`then`, if `config.message` set → push `Collected`; else if `breadcrumbConfig` set → push breadcrumb-only entry.
- Boundary flush (single root): `flushed` guard; if any entry has a message → assemble (1-layer: `head=Error(msg)`, `head.cause=leaf=cachedResult.error`, `head.stack=leaf.stack`) and `reporter.capture` once, wrapped in `try/catch`; clear scope; set `flushed`.
- `createSentryReporter.capture` via `Sentry.withScope`: `setTags({...mergedTags, library})`, add collected breadcrumbs, `captureException(assembled)`. Expand `SentryLike` (`withScope`, scope `setTags`/`addBreadcrumb`). `NoopReporter.capture` no-op. Disable live `addBreadcrumb` on collector path.

**Dependencies:** T0.

**Acceptance criteria:**
- Un-nested `Try.report('m').value()` / `.unwrap()` on `/node` emits **exactly one** event; assembled error shape == today's `createWrappedError` (`message='m'`, `cause=root`, `stack=root.stack`); tags include `library`. Existing `toHaveBeenCalledTimes(1)` / `toBeCalledWith` node tests pass (repointed to the `capture→captureException` path).
- **New behavior tests:** `error()`+`.report()` and `result()`+`.report()` now emit one event (previously zero); returned value/error unchanged.
- Breadcrumbs attach to the single event via `withScope` and never via global `addBreadcrumb` on the collector path; one breadcrumb per config (regression preserved).
- `capture()` throwing does not break `.value()`'s never-throw.

**Verification:** new `src/__tests__/report-once.node.test.ts`; run full suite; mock `@sentry/node` (`captureException`, `withScope`).

---

## T2 — Multi-layer nesting, de-dup, assembly with app-cause preservation

**Files:** `src/core/Try.ts` (assembly), new tests.

**Work:**
- Nested `Try` (store present) contributes into shared `this.scope`; never flushes.
- Assembly grouping by **root identity**: walk `error.cause` to deepest `Error` (cycle guard via `Set`); group by `===`.
- Per group: `messages` outermost→innermost; **leaf = innermost collected entry's original `error`** (preserves its native `.cause` chain + custom fields + stack); wrap messages above; wrapper `.stack = leaf.stack`. Tags fold root→boundary (boundary wins). One `capture` per group.

**Dependencies:** T1.

**Acceptance criteria:**
- 1 root through 3 layers each `.report()` → **1 event**, cause chain `m1→m2→m3→root`.
- An app error `DomainError(cause: dbErr)` wrapped by 2 layers → event leaf is `DomainError` **with its `cause: dbErr` intact** (not `dbErr` as leaf).
- Two independent roots under one boundary → **2 events**, each internally deduped.
- Wrapper nodes carry no `Try`/assembly-site frames.

**Verification:** `report-once.nest.test.ts` covering: 3-layer same root; app-cause preservation; sibling roots; mixed recovered (`.default().value()`) + bubbled (`.unwrap()`) under one boundary.

---

## T3 — Robustness & edge cases

**Files:** `src/core/Try.ts` (assembly + flush), tests.

**Work:**
- **error-like de-dup fallback:** when the deepest node is a reconstructed error-like value (identity unstable — `errorFromErrorLike` makes a new `Error` per layer), group by `name+'\0'+message+'\0'+(code??'')`.
- **Late-collection guard:** nested `Try` settling after `scope.flushed===true` → direct single emit of its own error (own boundary), debug-warn; never append to a dead scope.
- **Sync/async:** sync boundary flushes after sync portion (async `finally` not awaited — unchanged); async-nested-under-sync-boundary handled by late guard (separate emit).
- **`throwThroughErrorTypes`:** confirm still collected/reported (report before ignore-rethrow); only wrapping shape changes.

**Dependencies:** T2.

**Acceptance criteria:**
- Same error-like `{name,message,code}` thrown through 3 layers → **1 event** (no identity-split duplicates).
- Cyclic `cause` does not infinite-loop assembly.
- Fire-and-forget nested (`void inner.report().value()`) settling post-flush → **emits separately**, not lost; not double-counted into the original event.
- `throwThroughErrorTypes` entry still produces an event and rethrows un-wrapped.

**Verification:** `report-once.edge.test.ts`; include a `setTimeout(0)` nested case documenting actual Node ALS behavior; multiple terminals on one instance → at-most-once collect + at-most-once flush.

---

## T4 — Next.js entry: lazy runtime-guarded injection + build guards (parallel to T2/T3)

**Files:** `src/nextjs/index.ts`, `src/adapters/node/scopeProvider.ts` (reuse), `tsup.config.ts` / `package.json` (export conditions if needed), build-guard script, tests.

**Work:**
- Inject ALS provider in `/nextjs` **lazily and runtime-guarded** (no top-level `import` of the node module). Gate on Node runtime (`process.env.NEXT_RUNTIME === 'nodejs'` or `AsyncLocalStorage` feature-detect); Edge/client leave Noop.
- Ensure shared globalThis registry → `/node` + `/nextjs` in one realm share one ALS/scope.
- Build guard asserting `node:async_hooks` absent from browser/edge/client output; consider `edge-light`/`react-server`/`browser` export conditions.

**Dependencies:** T0, T1.

**Acceptance criteria:**
- `/nextjs` Node runtime dedups identically to `/node`.
- Edge/client portion of the nextjs bundle contains **no** `node:async_hooks` (build-guard test).
- Importing both `/node` and `/nextjs` in one realm shares a single scope (cross-entry dedup test).

**Verification:** build-guard grep over `dist/**`; a test importing both entries asserting one event for a nested chain; simulate Edge by leaving the provider uninjected → legacy per-layer behavior.

---

## T5 — Docs, changeset, D4 verification

**Files:** `README.md`, `.changeset/*`, possibly `src/adapters/createSentryReporter.ts` (only if D4 requires).

**Work:**
- **D4 first:** verify tag-as-`captureContext` against pinned `@sentry/*` peer versions (read installed `@sentry/core` types / a focused test). Only adjust tag passing if proven broken; the `withScope` path from T1 is correct regardless. Record the conclusion.
- README: reverse the "`error()`/`result()` are non-reporting" note; document the boundary/entry/recovery rules, breadcrumb event-scoping, `setScopeProvider` (node/nextjs-only), limitations (fire-and-forget, sync/async, Edge, linkedErrors depth).
- **Major** changeset describing the §10 breaking changes.

**Dependencies:** T3 (final behavior), T4 (packaging).

**Acceptance criteria:**
- D4 conclusion documented; no speculative tag "fix" shipped.
- README matches implemented semantics; no stale "no-op when paired with `.report()`" claim.
- Changeset present and marked major.

**Verification:** `npx changeset status`; doc review against test names; `npm run build && npm test` clean.

---

## Risks / watch-items

- **ALS context loss** (timers/detached promises) → mitigated by late-collection guard (separate emit), documented as unsupported for aggregation.
- **Per-entry bundle statics** → globalThis registry; verify two server entries share scope (T4).
- **Breaking changes** (error/result now report; breadcrumbs event-scoped) → major version; tests + README must move together (T1/T2/T5).
- **Sentry `linkedErrors` depth** → de-dup keeps chains short; document `linkedErrorsIntegration({ limit })`.

## Out of scope

Browser/Edge dedup; explicit boundary API; retry/circuit-breaking; cross-realm dedup.
