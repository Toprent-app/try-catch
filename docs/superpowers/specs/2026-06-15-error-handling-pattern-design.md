# Error-handling pattern: report-once via AsyncLocalStorage collector

Date: 2026-06-15 (revised 2026-06-16 after cross-AI review — see `*-REVIEWS.md`)
Status: Approved design, hardened after (1) adversarial verification against the codebase and (2) independent review by Gemini, Codex, and Grok.
Scope: `@power-rent/try-catch`, Node + Next.js entries only.

## 1. Problem

Three recurring failures in consuming codebases:

1. **Errors not reported.** Failures are swallowed; nothing reaches Sentry.
2. **Single-bag catch, no graceful recovery.** One `try { bigBlock } catch (e) { report }` around everything; no per-operation fallback.
3. **Duplicate reports up the stack.** `func1 → func2 → func3` each wrap-and-report the same root failure → 3 Sentry events for 1 real problem.

The `Try` library already supplies the *mechanism* to handle each failure; nothing enforces *report-once* or a consistent layer doctrine. This work adds the missing mechanism; the usage doctrine falls out of how it behaves.

## 2. Goals / non-goals

**Goals**

- Exactly **one Sentry event per distinct root failure**, regardless of how many layers wrap it.
- That single event carries the **nested cause chain** of every layer's message AND preserves any **pre-existing application `cause` chain** on the original error.
- Errors are reported even when a layer **recovers gracefully** (`.report().default().value()`), so recovery no longer means silence.
- The **real failed-function stack** is preserved on the leaf; `Try`/wrapper frames are not added.
- **Node + Next.js (Node runtime) only.** Browser, bare core, and Next.js Edge are unchanged (legacy path).

**Non-goals**

- Browser / Edge dedup (no reliable `AsyncLocalStorage`).
- Aggregating fire-and-forget / non-awaited / late-settling nested work (documented unsupported — §12).
- Retry / circuit-breaking.

## 3. Decisions baked in (from review)

- **Boundary model: implicit only, hardened.** The outermost `Try` in the async context tree opens the scope; no new public boundary API. Hardened with a `globalThis` registry (§7.1) and a `flushed` guard (§4.6).
- **`.report()` always contributes.** Collection is gated on `.report()` having been called, **not** on terminal type. `error()` and `result()` still return the error/result to the caller, but no longer suppress the report. **This reverses today's "`error()`/`result()` are non-reporting" contract on the collector path** (§10) — intended.
- **Preserve application cause chains.** The emitted leaf is the innermost collected *original* error with its native `.cause` chain intact (§5), not the deepest-walked root.
- **Tag-as-hint is treated as unverified, not a known bug** (§11 D4): `@sentry/core` `captureException(error, captureContext)` appears to accept `tags`; verify against pinned peer versions before changing anything.

## 4. Core model

### 4.1 Types (core, browser-safe — no `node:async_hooks`)

```ts
interface Collected {
  readonly error: Error;                 // the original error THIS layer caught (cachedResult.error), cause chain intact
  readonly message?: string;             // config.message; undefined → contributes no cause node (breadcrumb-only entry)
  readonly tags: Readonly<Record<string, string>>;
  readonly breadcrumbData?: Record<string, unknown>;
  readonly functionName?: string;
}

interface Scope {
  readonly errors: Collected[];          // append-only during the scope's life
  flushed: boolean;                      // set true after the boundary emits; guards late/repeat flush
}

interface ScopeProvider {
  readonly collects: boolean;            // false → legacy path (browser/core/Edge); true → collector path (Node)
  getStore(): Scope | undefined;
  run<T>(scope: Scope, fn: () => T): T;  // establish scope for fn + its async continuations; returns fn() synchronously
}
```

`Scope`/`Collected`/`ScopeProvider` and the default `NoopScopeProvider` are pure core (no `node:async_hooks`).

### 4.2 Process-wide registry (globalThis)

Because `tsup` `splitting:false` inlines a `Try` class per entry bundle (§7.1), a class static would not be shared when two entries load in one realm. The provider **and** the ALS instance live on a `globalThis` registry so all bundle copies converge:

```ts
const KEY = Symbol.for('@power-rent/try-catch/registry');
type Registry = { scopeProvider: ScopeProvider; defaultReporter: Reporter };
// Try.setScopeProvider / getDefaultReporter read & write globalThis[KEY] (created lazily, NoopScopeProvider default).
```

`setScopeProvider` is **last-wins but idempotent for identical providers**; the ALS-backed provider stores its single `AsyncLocalStorage` on the registry so two server entries (`/node` + `/nextjs`) in one realm share one scope.

### 4.3 Path gate

Core branches once on `registry.scopeProvider.collects`:

- **`false` (legacy path)** — browser, bare core, Next.js Edge. **Exactly today's behavior**: report at the terminal (`value()`/`unwrap()` only) via `defaultReporter.report`, breadcrumbs added live, `error()`/`result()` non-reporting. No scope, no collection.
- **`true` (collector path)** — Node + Next.js Node runtime. Everything below applies.

### 4.4 Boundary detection & running the function (collector path)

Computed **once**, on the first live `execute()` (after the cache short-circuit at `Try.ts:788–796`, before `fn(...args)`):

```
isBoundary = provider.getStore() === undefined
scope      = isBoundary ? { errors: [], flushed: false } : provider.getStore()!
this.scope = scope                       // captured on the instance; terminals/flush use this, never a late getStore()
```

- **Boundary:** run the user fn inside the scope — `provider.run(scope, () => this.fn(...this.args))`. `run` returns the value synchronously and unchanged (sync stays sync), so `isPromiseLike` classification is unaffected. ALS propagates the scope across the fn's own `await` continuations.
- **Nested:** call `this.fn(...args)` directly (already in scope).

Only the user fn is wrapped — not `Try`'s internal `.then/.catch/.finally` settle continuations (they create no nested `Try`s; flush uses the captured `this.scope`).

### 4.5 Collection (gated on `.report()`, all terminals)

On the collector path, when a terminal (`value`/`unwrap`/`error`/`result`/`then`) settles on the **failure** branch, **once per instance** (a `collected` flag, mirroring `breadcrumbsAdded`):

- If `config.message` is set → push `Collected { error: cachedResult.error, message, tags, breadcrumbData, functionName }`.
- Else if `config.breadcrumbConfig` is set → push a **breadcrumb-only** `Collected` (no `message`), so its breadcrumbs attach **iff** that root's event ultimately fires.
- Else → contribute nothing.

Terminals differ **only** in what they return/throw, never in whether they collect. This realizes "`.report()` always contributes": `error()`/`result()` collect too.

`cachedResult.error` is the original error this layer caught (cause chain intact), independent of what `unwrap()` later throws.

### 4.6 Flush (boundary only, idempotent, isolated)

The boundary's terminal, after `execute()` settles and after this instance's own collection:

1. If `scope.flushed` is already `true` → no-op (idempotency guard).
2. If no entry in `scope.errors` carries a `message` → no event (breadcrumb-only or empty scope); set `flushed = true`; done. (Matches today: no report intent → no event.)
3. Otherwise, set `flushed = true`, then for **each distinct root group** (§5) assemble and `reporter.capture(...)` **once**, each wrapped in `try/catch` so a failing Sentry call cannot break `.value()`'s never-throw contract nor block other roots. Clear `scope.errors`.

Flush fires for both success and failure of the boundary fn, and regardless of the boundary's terminal type. Because the terminal runs after `execute()` resolves, the single capture precedes any re-throw from `unwrap()`.

**Late collection guard.** A nested `Try` that settles after the boundary flushed (`scope.flushed === true`) must **not** append to the dead scope. Instead it falls back to **direct single emit** of its own error (acts as its own boundary) and, in debug mode, warns. This bounds the documented fire-and-forget limitation (§12) to "may emit separately" rather than "silently lost."

### 4.7 Ordering (boundary)

1. `fn` settles; `cachedResult` set.
2. Run user `finally` callback. (Async path: awaited, as today. Sync path: a `finally` callback that returns a Promise is **not** awaited — unchanged from today, `Try.ts:839` — so a sync boundary flushes after the synchronous portion only.)
3. This instance collects its own error (if `.report()`/breadcrumbs set).
4. Flush (steps in §4.6).
5. Terminal returns or re-throws.

### 4.8 Sync vs async

- **Async boundary fn awaiting its nested `Try`s** is the supported aggregating pattern.
- **Sync boundary** flushes synchronously; only synchronously-collected nested errors aggregate. A nested *async* `Try` under a *sync* boundary settles after flush → handled by the §4.6 late-collection guard (emits separately, not lost).

## 5. Assembly algorithm

Input: `Collected[]` in execution order (innermost first). Output: one assembled `Error` per distinct root group.

1. **Group for de-dup.** For each entry compute its *root key*: walk `error.cause` to the deepest `Error` (with a **cycle guard** — track visited via a `Set`, stop on repeat). Group by that root's **object identity** (`===`). **Fallback key:** if the deepest node is a reconstructed error-like value (identity unstable across layers because `errorFromErrorLike` builds a new `Error` per layer — common for GraphQL/HTTP `{name,message,code}` shapes), group by `name + '\0' + message + '\0' + (code ?? '')`. This keeps the common error-like case from splitting into duplicate events.
2. **Per group** (skip groups whose entries all lack a `message`):
   - `messages` = the group's entries' `message`s in **outermost→innermost** order (reverse of collection order), dropping `undefined`.
   - **Leaf** = the **innermost collected entry's `error`**, used by reference — preserving its `name`, `stack`, custom own-enumerable fields, **and its own native `.cause` chain** (so an application `DomainError(cause: dbError)` is kept, not discarded for `dbError`).
   - Build wrappers above the leaf: `head = new Error(messages[0])`, `head.cause = new Error(messages[1])`, … last wrapper `.cause = leaf`. Each wrapper's `.stack` is set to the **leaf's stack** (a freshly constructed `Error` would otherwise capture the library assembly-site frames; copying the leaf stack keeps `Try`/wrapper frames out and matches today's single-wrap behavior).
3. **Tags:** fold the group's entries innermost→outermost, boundary applied last (boundary wins): `tags = group.reduce((acc, e) => ({ ...acc, ...e.tags }), {})` in root→boundary order.
4. **Breadcrumbs:** the group's collected breadcrumb data (including breadcrumb-only entries) attach to **this group's** event only.
5. Emit `reporter.capture(head, { tags, breadcrumbs })` for the group.

**Invariant:** 1 root × N layers → 1 group → 1 event `msg₁ → msg₂ → msg₃ → leaf(→ app cause chain)`. Two independent roots under one boundary → 2 groups → 2 events. This is "one event per root failure."

**Sentry depth:** linked-exception rendering truncates beyond a limit (commonly ~5). De-dup keeps chains short; document recommending consumers configure `linkedErrorsIntegration({ limit })` if layer depth can exceed it.

## 6. Reporter changes

Add an **optional** method to `Reporter` (so existing third-party reporters keep type-checking; absence falls back to per-root `report()`):

```ts
capture?(assembledError: Error, opts: {
  tags: Record<string, string>;
  breadcrumbs?: Array<{ data: Record<string, unknown>; functionName?: string }>;
}): void;
```

- `createSentryReporter.capture` uses an **isolated scope** so tags/breadcrumbs attach to *this* event only and never mutate global Sentry state:
  ```ts
  Sentry.withScope((s) => {
    s.setTags({ ...tags, library: '@power-rent/try-catch' });
    breadcrumbs?.forEach((b) => s.addBreadcrumb({ message: `Calling ${b.functionName ?? 'anonymous'} function`, data: b.data }));
    Sentry.captureException(assembledError);
  });
  ```
  This requires expanding `SentryLike` to include `withScope` and a scope with `setTags`/`addBreadcrumb`.
- `report()` is retained unchanged for the legacy path. `NoopReporter` omits `capture` (or no-ops it).
- **Breadcrumbs:** on the collector path, `addBreadcrumbsIfConfigured` does **not** add to Sentry live; breadcrumb data is collected and attached only via `capture()` (closes the cross-request leak). The legacy path keeps live breadcrumbs.

## 7. Architecture & packaging

- **Core** stays browser-safe: types + `NoopScopeProvider` + registry + boundary/collection/flush/assembly + path gate. **No `node:async_hooks`.**
- **ALS provider** lives in a node-only module (`src/adapters/node/scopeProvider.ts`) importing `node:async_hooks`; stores its single `AsyncLocalStorage` on the `globalThis` registry; `collects: true`.
- **Injection:** `src/node/index.ts` injects it directly. `src/nextjs/index.ts` injects it **lazily and runtime-guarded** — never a top-level static `import` of the node module (that would pull `node:async_hooks` into the shared Edge/client bundle before any guard runs). Use a guarded dynamic import / `require` keyed on Node-runtime detection (e.g. `process.env.NEXT_RUNTIME === 'nodejs'` or `AsyncLocalStorage` feature-detect); Edge/client leave `NoopScopeProvider`.
- **Browser / bare core:** never inject → legacy path.
- **Build guards:** assert `node:async_hooks` never appears in `dist/browser/*`, `dist/index.*`, or the Edge/client portion of the nextjs bundle. Consider package.json export conditions (`edge-light`/`react-server`/`browser`) to route a node-only sub-bundle.

### 7.1 Per-entry bundling

`tsup` `splitting:false` inlines a `Try` copy per entry. The `globalThis` registry (§4.2) makes the provider + ALS shared across bundle copies in one realm, so mixing `/node` + `/nextjs` server-side dedups correctly. Server vs client/Edge remain separate realms by design (and correctly produce separate events). Guarantee: **one event per root failure within a single realm/async-context tree.**

## 8. API semantics (collector path)

`.report(msg)` is uniform at every layer — "register this failure with this message." Emission is automatic: nested suppress, boundary emits one event per root.

| Terminal | Behavior (collector path) |
|---|---|
| `value()` / `await` | collect (if `.report`/breadcrumbs) + recover (default/undefined) |
| `unwrap()` | collect (if `.report`) + rethrow (after boundary capture) |
| `error()` | collect (if `.report`) + return the error |
| `result()` | collect (if `.report`) + return the discriminated result |

Boundary terminals additionally flush (§4.6) regardless of type. `throwThroughErrorTypes`: still collected/reported; the list governs wrapping/rethrow **shape** only.

## 9. Doctrine (falls out)

| Problem | Resolution |
|---|---|
| Errors not reported | Any failure carried with `.report(msg)` — bubbled, recovered, or inspected — is collected and emitted once at the boundary. |
| Single-bag, no recovery | Per-op `Try`: recoverable → `.report(msg).default(x).value()`; fatal → `.report(msg).unwrap()`; inspect → `.report(msg).result()` — all still contribute one boundary event. |
| Duplicate reports | Nested layers collect, never emit. One event per root at the boundary, nested causes + app cause chain. |

**Layer rule:** inner layers annotate (`.report(msg)` + recover/bubble/inspect); the outermost `Try` (scope owner) emits. **Recovery rule:** to recover an expected error *silently*, omit `.report()`. **Entry rule:** wrap entry points (route handlers, server actions, jobs) in a `Try` so a scope exists; otherwise the first inner `Try` is the boundary for its subtree only.

## 10. Backward compatibility & test impact

- **Browser / bare core / Edge:** legacy path, byte-identical.
- **Node / Next.js — intended breaking changes (collector path):**
  1. **`error()`/`result()` with `.report()` now emit** (previously non-reporting). Existing tests asserting `captureException` NOT called for `result()+report()` must be updated; README line 197 reversed.
  2. **Breadcrumbs become event-scoped.** A breadcrumb attached to a failure reaches that failure's event; a breadcrumbs-only failure with no report anywhere in the scope no longer adds a *global* breadcrumb (that global add was the cross-request leak). Tests asserting live `addBreadcrumb` for breadcrumbs-only-no-report on the node/nextjs entry change accordingly.
- **Node / Next.js — preserved invariants:** a standalone un-nested `Try` is its own boundary → one event at its terminal, same count/shape as today (`toHaveBeenCalledTimes(1)` tests stay green); 1-layer assembled error equals today's `createWrappedError` output + tag injection; breadcrumb double-add regression stays fixed (one add per breadcrumb, now at flush).
- **`Reporter.capture` is optional** → existing custom reporters keep compiling (fallback to `report()` per root). Still note in changelog.
- **New tests:** multi-layer nested cause chain + app-cause-chain preservation; one-event-per-root dedup incl. error-like `{name,message,code}` through 3 layers; recovered-nested-under-successful-boundary; `error()`/`result()`+`.report()` now emit; sync/async; late/fire-and-forget → separate emit (not lost); `flushed` idempotency (multiple terminals on one instance); `throwThroughErrorTypes` still emits; 6+ layer chain vs Sentry depth; dual `/node`+`/nextjs` import shares one scope.

## 11. Decisions & flags

- **D1** One event **per distinct root** (not per sibling-chained mega-error).
- **D2** Recovered nested errors with `.report()` are reported.
- **D3** `throwThroughErrorTypes` still collected/reported (wrapping-only semantics).
- **D4** **Tag-as-hint: verify, do not assume.** Codex review notes installed `@sentry/core` `captureException` accepts a capture context where `tags` is valid; the §6 `withScope` approach is correct regardless. Confirm against pinned peer versions; do not ship a "fix" for a non-bug.
- **D5** `.report()` always contributes regardless of terminal (user decision).
- **D6** Boundary is implicit-only, hardened (globalThis registry + `flushed` guard); no explicit boundary API (user decision). Fire-and-forget/late nested → separate emit, not silent loss.
- **D7** Breadcrumbs event-scoped (no global add on the collector path).
- **D8** `Reporter.capture` optional; isolated via `withScope`.

## 12. Limitations / unsupported

- **Await discipline:** only nested `Try`s awaited within the boundary fn's call tree aggregate. Fire-and-forget / `setTimeout` / `queueMicrotask` / detached promises settling after the boundary → **emit separately** (via §4.6 guard), not aggregated, not lost.
- **Sync boundary + async nested:** the async child emits separately.
- **`worker_threads`:** independent boundaries (no shared ALS) — intended.
- **Next.js Edge runtime:** legacy per-layer behavior (no ALS).
- **Sentry linked-exception depth:** configure `linkedErrorsIntegration({ limit })` for very deep stacks.

## 13. Out of scope

- Browser/Edge dedup; explicit boundary API; cross-realm dedup.
- Retry/backoff/circuit-breaking.
- Changeset: behavior change for node/nextjs entries (includes the §10 breaking changes) → **major** version bump warranted; decide at implementation.

## 14. Implementation checklist

1. Core: `Scope`/`Collected`/`ScopeProvider` + `NoopScopeProvider`; `globalThis` registry; path gate on `collects`.
2. Core `execute()`: boundary detection at first live execution; wrap fn in `provider.run`; capture `this.scope`.
3. Core terminals: `.report()`-gated collection on all terminals; `collected` idempotency flag; breadcrumb-only entries.
4. Core boundary flush: `flushed` guard, late-collection fallback, per-root assembly (§5) with cause-chain preservation, error-like fallback key + cycle guard, per-root `try/catch`.
5. `Reporter.capture?` optional + `createSentryReporter.capture` via `withScope` (+ expand `SentryLike`); breadcrumb collect-then-attach.
6. ALS provider (node-only, on globalThis registry); direct inject in `/node`; lazy runtime-guarded inject in `/nextjs`; build guard for `node:async_hooks` absence in browser/edge bundles.
7. Tests per §10; README updates (reverse the `error()`/`result()` non-reporting note, document boundary/entry rules, breadcrumb scoping, `setScopeProvider`).
8. Verify D4 against pinned `@sentry/*` versions. Changeset (major).
