# TODO — report-once via AsyncLocalStorage

Spec: `docs/superpowers/specs/2026-06-15-error-handling-pattern-design.md` · Plan: `tasks/plan.md`
Order top→bottom; respect deps. Each task ends green (`npm test` + `npm run build`). `[CP]` = human review gate.

- [ ] **T0 — Foundation** (no deps): `Scope`/`Collected`/`ScopeProvider` types + `NoopScopeProvider` + globalThis registry (`Symbol.for('@power-rent/try-catch/registry')`); `Try.setScopeProvider`/`getScopeProvider`; reporter `capture?` optional; path gate. ✔ build green, all existing tests pass unchanged, no `node:async_hooks` in core/browser.
- [ ] **[CP-A]** legacy intact, build clean, core async_hooks-free.
- [ ] **T1 — Single-Try collector (`/node`)** (deps: T0): ALS provider on registry + inject in `/node`; `execute()` boundary detection + `provider.run` wrap + captured `this.scope`; `.report()`-gated collection on all terminals + `collected` flag; boundary flush w/ `flushed` guard + per-root `try/catch`; `createSentryReporter.capture` via `withScope`; expand `SentryLike`; breadcrumbs off-global. ✔ un-nested parity (count+shape); `error()`/`result()`+`.report()` now emit; breadcrumb event-scoped; capture failure can't break `.value()`.
- [ ] **[CP-B]** single-Try parity + new emit behavior demonstrated.
- [ ] **T2 — Multi-layer nest + assembly** (deps: T1): nested contribute-not-flush; group by root identity (cycle guard); leaf = innermost original error (preserve app `cause`); message wrappers; tag fold (boundary wins); one `capture`/root. ✔ 1 root×3 layers → 1 event chain; app cause preserved; sibling roots → N events.
- [ ] **[CP-C]** multi-layer dedup + cause preservation.
- [ ] **T3 — Robustness** (deps: T2): error-like dedup fallback key (`name+message+code`); late-collection guard (post-flush → separate emit); sync/async behaviors; `throwThroughErrorTypes` still reports. ✔ error-like through 3 layers → 1 event; cyclic cause safe; fire-and-forget → separate emit not lost; multi-terminal at-most-once.
- [ ] **T4 — Next.js entry** (deps: T0, T1 — parallel to T2/T3): lazy runtime-guarded ALS inject in `/nextjs`; Edge/client → Noop; build guard no `node:async_hooks` in browser/edge; dual `/node`+`/nextjs` share one scope. ✔ nextjs node dedups; edge bundle clean; cross-entry single scope.
- [ ] **[CP-D]** nextjs/edge packaging verified.
- [ ] **T5 — Docs + changeset + D4** (deps: T3, T4): verify D4 (tag-as-`captureContext`) vs pinned `@sentry/*` — fix only if proven broken; README reversal + boundary/entry/recovery/breadcrumb/limitations docs; **major** changeset. ✔ D4 documented; README matches behavior; changeset major.
- [ ] **[CP-E]** docs/contract/changeset final.

**New test files:** `report-once.node.test.ts` (T1), `report-once.nest.test.ts` (T2), `report-once.edge.test.ts` (T3), nextjs/build-guard tests (T4).
**Breaking (major):** `error()`/`result()`+`.report()` now emit; breadcrumbs event-scoped (no global add on collector path).
