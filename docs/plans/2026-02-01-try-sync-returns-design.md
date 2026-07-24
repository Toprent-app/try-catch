# Try sync return behavior design

Date: 2026-02-01

Status: type-surface follow-up to PR #33 (MaybePromise terminals + conditional `finally()`).

## Goal

Make terminal methods return synchronously when wrapped execution completes
synchronously. Preserve `await` ergonomics and sound TypeScript types when a
Promise-typed function throws before returning a Promise.

Applies to: `value()`, `unwrap()`, `error()`, and `result()`.

Expose `finally()` only when the wrapped function is statically guaranteed to
return a Promise-like value.

## Behavior

- A non-Promise function executes immediately. Terminal methods return plain
  values.
- A Promise-like result is awaited. Terminal methods return Promises.
- A synchronous throw is captured immediately, including a throw from a
  function declared to return `Promise<T>`.
- For a Promise-typed or possibly Promise-returning function, terminal methods
  return either a plain value or a Promise. Callers use `await`, which handles
  both shapes.
- `value()` returns the function result or `defaultValue`. When an error exists
  and no `defaultValue` is set, it returns `undefined`.
- `unwrap()` throws synchronously for a synchronous error and rejects for an
  asynchronous error. Otherwise, it returns or resolves to the value.
- `error()` returns or resolves to the error or `undefined`.
- `result()` returns or resolves to `{ success, value, error }`, with `success`
  true only when no error exists.
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

## Internal execution model

- Add one lazy execution path that runs the wrapped function once on the first
  terminal call.
- Store `isAsync`, `syncResult` or `syncError`, and `asyncPromise`.
- When execution returns a Promise-like value, set `isAsync = true` and record
  its result through `then` and `catch`.
- When execution returns a non-Promise value or throws synchronously, set
  `isAsync = false` and record the result or error immediately.
- Cache the observed runtime shape and result. Repeated terminal calls do not
  re-run the wrapped function.
- Async `finally()` callbacks remain part of the cached Promise chain and finish
  before async terminal methods settle.

## TypeScript typing

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

Apply it to terminal methods:

```typescript
error(): MaybePromise<TReturn, Error | undefined>;
result(): MaybePromise<TReturn, TryResult<TReturn>>;
```

`value()` and `unwrap()` use the same helper with their existing value and
default-value types.

Use an internal implementation class plus conditional public facade so
`finally` is absent, rather than merely uncallable, for synchronous functions:

```typescript
type PublicTry<TReturn, TArgs extends readonly unknown[]> =
  Omit<TryImpl<TReturn, TArgs>, 'finally'> &
  ([TReturn] extends [PromiseLike<unknown>]
    ? Pick<TryImpl<TReturn, TArgs>, 'finally'>
    : {});
```

Terminal typing and `finally()` availability intentionally use different
checks. Terminal methods account for any possible Promise member. `finally()`
requires the complete return type to be Promise-like.

Export a typed constructor that returns `PublicTry`. Preserve static members,
framework-specific exports, fluent method return types, and default-value
narrowing through the facade.

## `finally()` boundary

Type-only classification follows declared return type, not runtime function
syntax. A function declared `(): Promise<T>` receives the async public surface,
even when it throws synchronously before returning its Promise.

This means type-only changes cannot guarantee awaiting an async finalizer on
that exceptional path. Full parity would require runtime normalization or an
explicitly branded async API; both are outside this design. Tests must document
this boundary rather than promise unsupported behavior.

## Tests

- Verify synchronous `value()`, `unwrap()`, `error()`, and `result()` return
  plain values.
- Verify synchronous throws return defaults or errors immediately and make
  `unwrap()` throw immediately.
- Verify Promise results preserve existing asynchronous behavior.
- Add regression coverage for a non-`async` function declared
  `(): Promise<T>` that throws before returning:
  - runtime terminal result is plain;
  - `await` works;
  - type is `TValue | Promise<TValue>`.
- Add type tests proving `finally()` is absent for synchronous and
  `T | Promise<T>` functions.
- Add type tests proving `finally()` exists for `Promise<T>` functions.
- Add type tests proving `T | Promise<T>` terminal methods return
  `TValue | Promise<TValue>`.
- Verify fluent methods preserve the conditional facade and default-value
  narrowing.
- Ensure existing async-finalizer tests remain green for executions that return
  a Promise.

## Documentation

- Show synchronous usage without `await`.
- Show Promise-typed usage with `await`.
- Document `Promise.resolve(terminalResult).then(...)` for callers requiring
  chaining.
- Clarify that `finally()` is available only for statically Promise-like
  functions.
