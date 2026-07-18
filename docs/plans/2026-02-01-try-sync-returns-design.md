# Try sync return behavior design

Date: 2026-02-01  
Updated: 2026-07-18  
Status: follow-up to merged PR #33 (`try sync returns`) — **type surface +
`finally` facade only**; runtime sync terminals already shipped

## Goal

Ship sound TypeScript types for terminal methods when a Promise-typed function
can throw before returning a Promise, and restrict `finally()` to the public
type surface only when the wrapped function is statically guaranteed to return a
Promise-like value.

Runtime behavior for sync vs async settlement is **already implemented** (PR
#33). This design does **not** rewrite execution.

Applies to: `value()`, `unwrap()`, `error()`, and `result()`.

## Non-goals

- No rewrite of `execute()`, caching, or report-once / ALS scope setup.
- No change to the `TryResult<T>` discriminated-union shape.
- No runtime normalization that always wraps terminals in `Promise` (would undo
  sync returns).
- No branded-async API or compile-time detection of `async` syntax.
- No removal of instance thenability in this change (see [Thenable](#thenable)).

## Current baseline (already on main)

| Area | Status |
|------|--------|
| Lazy first-terminal `execute()` + cache | Done (`cachedResult`, `cachedPromise`, `isAsync`) |
| Sync terminals return plain values | Done |
| Promise-like results stay async | Done |
| Sync throw captured immediately | Done (including from `(): Promise<T>`) |
| Report-once / collector settle on sync path | Done — leave untouched |
| Terminal types when `TReturn` may be Promise-like | **`Promise<TValue>` only** (unsound for sync throw) |
| `finally()` on public types | **Always present** |
| `PublicTry` facade | **Absent** |

`IfPromise` today maps any possible Promise member to “always `Promise`”:

```typescript
// Today (unsound for syncThrow below)
error(): IfPromise<TReturn, Promise<Error | undefined>, Error | undefined>;
```

```typescript
function syncThrow(): Promise<number> {
  throw new Error('boom');
}
const e = new Try(syncThrow).error();
// type: Promise<Error | undefined>
// runtime: Error  →  e.then(...) throws at runtime
```

## Behavior (runtime — already true; types must match)

- A non-Promise function executes immediately. Terminal methods return plain
  values.
- A Promise-like result is settled asynchronously. Terminal methods return
  Promises.
- A synchronous throw is captured immediately, including a throw from a
  function declared to return `Promise<T>`.
- For a Promise-typed or possibly Promise-returning function, terminal methods
  may return either a plain value or a Promise at runtime. Callers use `await`,
  which handles both shapes.
- `value()` returns the function result or `defaultValue`. When an error exists
  and no `defaultValue` is set, it returns `undefined`.
- `unwrap()` throws synchronously for a synchronous error and rejects for an
  asynchronous error. Otherwise, it returns or resolves to the value.
- `error()` returns or resolves to the error or `undefined`.
- `result()` returns or resolves to the existing discriminated union
  `TryResult<TReturn>`:

  ```typescript
  type TryResult<T> =
    | { readonly success: true; readonly value: Awaited<T> }
    | { readonly success: false; readonly error: Error };
  ```

  Do not flatten this into a single `{ success, value, error }` object type.
  Only the **outer** wrapper becomes `MaybePromise<…, TryResult<TReturn>>`.
- `finally()` is absent from the public type surface for functions not
  statically guaranteed to return a Promise-like value.
- Union returns such as `T | Promise<T>` are not statically guaranteed async,
  so `finally()` is absent.

## Why Promise-typed terminals use a union

TypeScript gives these functions the same callable type:

```typescript
async function asyncThrow(): Promise<number> {
  throw new Error('boom');
}

function syncThrow(): Promise<number> {
  throw new Error('boom');
}
```

Runtime behavior differs: `asyncThrow()` returns a rejected Promise, while
`syncThrow()` throws before returning anything. TypeScript does not encode
whether `async` syntax was used or whether a function can throw synchronously.
No conditional type can distinguish these cases.

Terminal return types must therefore include both runtime shapes. This remains
ergonomic with `await`:

```typescript
const error = await new Try(syncThrow).error();
```

Callers requiring Promise chaining normalize explicitly:

```typescript
Promise.resolve(new Try(syncThrow).error()).then(handleError);
```

### Intentional over-approximation for honest `async` functions

For a true `async function f(): Promise<T>`, terminal methods almost always
return a `Promise` at runtime (`async` turns pre-return throws into
rejections). Typing them as `TValue | Promise<TValue>` is still an
over-approximation: chaining needs `await` or `Promise.resolve(...)` even when
runtime is always async.

That tradeoff is intentional. Prefer `await`. Do not attempt to narrow back to
`Promise<TValue>` for “real” async functions without branding or a separate
API — both are out of scope.

## Internal execution model (do not rewrite)

Keep the existing path in `src/core/Try.ts`. Field names stay as today
(`cachedResult`, `cachedPromise`, `isAsync`, `state`); do not introduce a
parallel `syncResult` / `syncError` / `asyncPromise` store.

Existing contracts to preserve:

- Lazy execution on first terminal call; repeated terminals reuse the cache.
- Promise-like return → `isAsync = true`, settle via `then` / `catch`, attach
  async `finally` to the cached promise chain so it finishes before async
  terminals settle.
- Non-Promise return or synchronous throw → `isAsync = false`, store
  `TryResult`, run sync `finally` immediately (async finalizer on this path is
  fire-and-forget — see [`finally()` boundary](#finally-boundary)).
- Report-once scope open / collect / flush in `execute()` and
  `runReportSideEffects` / `collectorSettle` remain unchanged.

Implementation work is types + constructor facade + docs/tests, not a new
execution engine.

## TypeScript typing

### Helpers

Detect whether a return type may contain a Promise-like member, then expose both
possible runtime shapes:

```typescript
type MayReturnPromise<TReturn> =
  Extract<TReturn, PromiseLike<unknown>> extends never ? false : true;

type MaybePromise<TReturn, TValue> =
  MayReturnPromise<TReturn> extends true
    ? TValue | Promise<TValue>
    : TValue;
```

Replace (or stop using for terminals) `IfPromise<…, Promise<TValue>, TValue>`
with `MaybePromise<TReturn, TValue>` on terminal methods.

Apply it:

```typescript
error(): MaybePromise<TReturn, Error | undefined>;
result(): MaybePromise<TReturn, TryResult<TReturn>>;
// value() / unwrap() / default().value(): same helper with existing
// Awaited / default-value unions
```

### Edge cases for `MayReturnPromise`

| `TReturn` | `MayReturnPromise` | Notes |
|-----------|--------------------|--------|
| `never` | `false` | Sync branch |
| pure sync (`string`, etc.) | `false` | Plain terminals |
| `Promise<T>` / `PromiseLike<T>` | `true` | Union terminals; return wrapper is `Promise<TValue>` (runtime already uses `Promise.resolve` for thenables) |
| `T \| Promise<T>` | `true` | Union terminals; no `finally` |
| `any` | treat as may-promise | Same caution as today’s `IfPromise` |
| `unknown` | `false` under this helper | Runtime may still return a thenable; pre-existing class of unsoundness — out of scope |

### Conditional `finally` facade

Use an internal implementation type plus conditional public facade so `finally`
is **absent**, not merely uncallable, when the return type is not fully
Promise-like:

```typescript
type PublicTry<TReturn, TArgs extends readonly unknown[]> =
  Omit<TryImpl<TReturn, TArgs>, 'finally'> &
  ([TReturn] extends [PromiseLike<unknown>]
    ? Pick<TryImpl<TReturn, TArgs>, 'finally'>
    : {});
```

Terminal typing and `finally()` availability intentionally use different
checks:

- Terminals: any possible Promise **member** → `MaybePromise` union.
- `finally()`: complete return type Promise-like (`[TReturn] extends
  [PromiseLike<unknown>]`) → method present.

### Fluent methods, `default()`, constructor, adapters

A constructor that returns `PublicTry` is necessary but not sufficient. If
fluent methods are typed as returning `this` / `TryImpl`, `finally` reappears
after the first chain step:

```typescript
// Must not typecheck for a sync fn:
new Try(syncFn).report('x').finally(() => {});
```

Requirements:

1. **Every fluent method** (`report`, `breadcrumbs`, `tag`, `tags`, `debug`,
   `finally` when present) returns `PublicTry<TReturn, TArgs>` (or an
   equivalent mapped type that preserves the facade), not bare `TryImpl`.
2. **`default<D>()`** returns the same facade with `value()` narrowed to
   `MaybePromise<TReturn, Awaited<TReturn> | D>` (same narrowing semantics as
   today, with `MaybePromise` instead of `IfPromise`).
3. **Constructor typing:** public construct signature is
   `new <…>(fn, ...args) => PublicTry<…>`. Runtime value remains a real class
   instance (`instanceof` and subclassing keep working). Prefer keeping a
   single runtime class with a typed construct signature / export alias over
   a dual-class hierarchy unless the dual approach is clearly simpler.
4. **Statics** (`setDefaultReporter`, `getDefaultReporter`, `setScopeProvider`,
   `getScopeProvider`, `throwThroughErrorTypes`, `scope`) stay on the exported
   `Try` constructor.
5. **Framework adapters** (`src/nextjs` subclass, `src/node`, `src/browser`
   re-exports):
   - Prefer inheriting facade behavior from core construct typing so adapters
     do not reimplement conditionals.
   - If the nextjs subclass redeclares the construct signature or adds
     methods, re-apply the same `PublicTry` return typing so
     `new Try(syncFn).finally` is still absent at the adapter entry.
   - Type tests must cover at least the primary entry used in
     `type-safety.test.ts` (currently nextjs) and core/node if signatures
     diverge.

## Thenable

Keep instance `then` (direct `await new Try(...)`).

- Implementation already normalizes via `Promise.resolve(this.value())`, so both
  plain and Promise terminal shapes work.
- `then` continues to return `Promise<…>` (always async at the instance-await
  boundary).
- Docs may prefer explicit terminals (`.value()` / `.error()`) for clarity;
  thenable is not removed in this design.
- Removing thenability is a separate decision (explored on other branches) and
  is out of scope here.

## `finally()` boundary

Type-only classification follows declared return type, not runtime function
syntax. A function declared `(): Promise<T>` receives the async public surface
(including `finally`), even when it throws synchronously before returning its
Promise.

Consequences:

| Case | `finally` on types | Async finalizer vs terminal settle |
|------|--------------------|-------------------------------------|
| Pure sync / `T \| Promise<T>` | Absent | N/A at type level; runtime method may still exist if cast |
| `Promise<T>` that returns a Promise | Present | Awaited on async path (existing tests stay green) |
| `Promise<T>` that throws **before** return | Present | Sync settle path: async finalizer is fire-and-forget; terminal may return plain value before finalizer finishes |

Full parity (await async finalizer on that exceptional path) would require
runtime normalization or an explicitly branded async API; both are outside this
design. Tests must document this boundary rather than promise unsupported
behavior.

Hiding `finally` for pure sync is an honesty fix: today pure-sync can call
`.finally(async () => …)` and the terminal does not await it.

## Compatibility (semver)

This is a **TypeScript breaking change** for public terminal and fluent types.
Ship as a **major** version (or document under the repo’s established major
policy if types-only breaks are already major).

### What breaks

1. Assigning a Promise-typed terminal to `Promise<T>` without `await` /
   `Promise.resolve`:

   ```typescript
   // Before: ok for Promise-typed fn
   // After: type error (union is not assignable to Promise<T>)
   const p: Promise<User | undefined> = new Try(fetchUser, id).value();
   ```

2. Calling `.then` on a terminal result without normalizing:

   ```typescript
   // Before: typechecked; unsafe if runtime was plain
   // After: type error on union
   new Try(syncThrow).error().then(handle);
   ```

3. Calling `.finally` on a Try whose `TReturn` is pure sync or
   `T | Promise<T>`:

   ```typescript
   // Before: typechecked
   // After: property does not exist on type
   new Try(() => 1).finally(() => {});
   ```

### What stays source-compatible

- `await new Try(asyncFn).value()` and other `await`ed terminals.
- Pure sync callers that already use plain returns without `await`.
- Runtime behavior for true async functions (still return Promises when the
  function returns a Promise-like).
- Report-once aggregation and adapter reporter wiring.

### Migration

```typescript
// Prefer await
const value = await new Try(fn, ...args).value();

// Chaining without await
Promise.resolve(new Try(fn, ...args).error()).then(handleError);

// finally only when return type is fully Promise-like
await new Try(asyncFn).finally(cleanup).value();
```

## Tests

### Runtime (keep / extend)

- Verify synchronous `value()`, `unwrap()`, `error()`, and `result()` return
  plain values (already covered; keep green).
- Verify synchronous throws return defaults or errors immediately and make
  `unwrap()` throw immediately.
- Verify Promise results preserve existing asynchronous behavior.
- Add regression coverage for a non-`async` function declared
  `(): Promise<T>` that **throws before returning** (not `Promise.reject`):
  - runtime terminal result is plain (not a Promise instance);
  - `await` works;
  - type is `TValue | Promise<TValue>`.
- Rename or clarify the existing test that uses `Promise.reject` under a
  “when they throw” name so it is not confused with true sync throw.
- Ensure existing async-finalizer tests remain green for executions that
  **return** a Promise.
- Report-once: sync path still collects/flushes once (no execute rewrite
  regression).
- Repeated terminal calls cache the same runtime shape (plain vs Promise).

### Type tests

- `finally()` absent for synchronous and `T | Promise<T>` functions.
- `finally()` present for `Promise<T>` / fully Promise-like functions.
- `T | Promise<T>` and `Promise<T>` terminals return `TValue | Promise<TValue>`.
- Fluent chain preserves facade: `.report().default().tag()` does not restore
  `finally` for sync functions; `default()` still narrows `value()`.
- Adapter entry used by type-safety tests (nextjs) matches core facade rules.
- Assignability: `const p: Promise<T> = new Try(asyncFn).value()` is a type
  error (documents the break).
- Documented boundary: Promise-typed sync throw may still typecheck
  `.finally(...)`; no test should claim async finalizer is awaited on that
  path.

## Documentation

- Status line: sync runtime shipped in 1.1.0 / PR #33; this work is type
  soundness + conditional `finally`.
- Show synchronous usage without `await`.
- Show Promise-typed usage with `await` (preferred).
- Document `Promise.resolve(terminalResult).then(...)` for chaining.
- Clarify that `finally()` is available only for statically fully Promise-like
  return types.
- Note the intentional union over-approximation for honest `async` functions.
- Note the Promise-typed sync-throw + async `finally` boundary.
- Thenable: `await new Try(...)` still works; prefer explicit terminals in new
  examples if clarity matters.
- Changelog / changeset: major, with migration bullets from
  [Compatibility](#compatibility-semver).

## Implementation order

1. Add `MayReturnPromise` / `MaybePromise`; switch terminal (+ `default().value`)
   signatures; leave `execute()` untouched.
2. Type tests for union returns and Promise-typed sync throw (types + runtime
   plain result).
3. `PublicTry` construct signature + fluent / `default()` return types.
4. Adapter entries if construct signatures need re-export care; type tests.
5. Docs + major changeset.
6. Only add runtime tests where behavior must be pinned; do not restructure
   execution storage or report-once.
