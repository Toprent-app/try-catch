# @power-rent/try-catch

## 2.0.0

### Major Changes

- 41a5ada: `error()` and `result()` honor `.report()`. All four terminals — `value()`, `unwrap()`, `error()`, `result()` — send the failure to the configured `Reporter` when `.report()` is set, so reading a failure through `error()`/`result()` on a chain carrying `.report()` produces a Sentry event.
- 4e17063: Sound terminal return types for Promise-typed functions: terminals that may settle sync or async are typed as `TValue | Promise<TValue>` (use `await`). `finally()` is on the public type surface only when the wrapped function's return type is fully Promise-like.
  
  BREAKING CHANGE (types): terminal methods of a Promise-typed function return `TValue | Promise<TValue>`. Assigning a terminal result to `Promise<T>`, or calling `.then` on it, requires `await` or `Promise.resolve(...)`. `.finally()` is a type error on pure-sync and `T | Promise<T>` Try instances; the runtime method is unchanged and still reachable through a cast.
  
  BREAKING CHANGE (types): `Try` is now a constructor value typed as `TryConstructor` rather than a class declaration, and `/nextjs` re-exports it instead of declaring its own subclass. `new Try(...)` and the statics (`setDefaultReporter`, `getDefaultReporter`, `throwThroughErrorTypes`) are unchanged, and `class MyTry extends Try {}` still type-checks, but code that referred to `Try` as a class type must use the exported `Try` / `PublicTry` type alias instead.
  
  BREAKING CHANGE (types): fluent configuration methods (`report`, `breadcrumbs`, `tag`, `tags`, `debug`, `finally`) return `PublicTry<TReturn, TArgs, TDefault>`. Annotations and generic wrappers written against a chained call must name that type.
- 236fbd5: Remove thenable behavior from `Try` instances entirely. No `Try` instance is ever thenable — `await new Try(fn)` yields the `Try` instance itself regardless of whether the wrapped function is sync or async. Callers must use `.value()`, `.unwrap()`, `.error()`, or `.result()` to execute and read the result. Migration: replace `await new Try(asyncFn, ...args)` with `await new Try(asyncFn, ...args).value()` (or `.unwrap()` / `.result()` / `.error()` depending on desired semantics).
- 236fbd5: 100% type-safe: eliminate all `any` from src. Breaking changes:
  - `BreadcrumbTransformer<T>` input narrowed from `any` to `unknown` — transformers with typed params need adjustment
  - `Try` gains 3rd generic `TDefault = undefined` (source-compatible default)
  - `.default()` returns a fresh `Try` instance carrying its own config. A reference held before `.default()` keeps the configuration it had, and `.report()`/`.tag()` calls made on the chain after `.default()` apply only to the clone.
  - Execution state — cached result, promise, breadcrumb emission, report emission, and finally-callback bookkeeping — is shared across a `.default()` chain. `fn` runs once, each `finally` callback reference runs once, and each distinct breadcrumb config and `.report()` message is emitted once, however many terminals are called on the pre- and post-`.default()` references.
  - Deprecated `ErrorReporter` class removed — use `Reporter` interface
  - ESLint flat config added with strict type-checked rules

### Minor Changes

- 236fbd5: A single settled execution reports each distinct `.report()` message at most once.
  
  The guard is keyed by `(execution, message)`. `.default()` produces a clone that shares the parent's execution, so a parent and clone carrying the same message yield one report, while clones carrying divergent messages each report their own. Repeated terminal calls on one instance are covered by the same key: an instance with `.report('m')` whose terminals are called three times yields one report.
  
  Applications that read a failure more than once — a `.value()` followed by an `.error()`, or a `.default()` chain consumed at both ends — see their Sentry event count for that failure drop to one.
- 236fbd5: Fix HI-02: errors whose `name` is registered with `Try.throwThroughErrorTypes` are exempt from reporting. With `.report()` set, a matching error is re-surfaced unwrapped and reaches no reporter, on all four terminals and on both the sync and async paths. Breadcrumbs configured via `.breadcrumbs()` are still recorded, so the context leading up to an expected domain error stays available.
  
  Sentry volume drops for applications that register throw-through types, and those errors stop appearing as issues.

### Patch Changes

- 1c85a88: Fix MD-02: positional string entries in `.breadcrumbs([...])` drop arguments whose value is `undefined`, matching the semantics of `extractFromKeys` for object-key extraction.
- 236fbd5: Fix MD-05: `.breadcrumbs(...)` calls the reporter's `addBreadcrumbs` (`Sentry.addBreadcrumb`) only when the extracted data is non-empty. Configurations that yield nothing — `.breadcrumbs([])`, a throwing transformer, or extraction against a primitive — record no breadcrumb event.
- 236fbd5: `value()`, `error()`, and `result()` return, and `unwrap()` throws only the error it wrapped, for errors carrying accessors that throw.
  
  `name` and `stack` are read through guarded helpers, so a caught value that passes `instanceof Error` but defines `get name()` or `get stack()` as a throwing accessor — a Proxy wrapper from an ORM, mock, or observability layer, or a subclass with a computed `name` — resolves to `''`/`undefined` and flows through the throw-through check and error wrapping normally.
- 236fbd5: Reconstructing an `Error` from a thrown error-like payload (`throw await res.json()`) skips own keys that change how the language treats the result: `toString`, `valueOf`, `toLocaleString`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, and `then`, alongside the existing `__proto__`, `constructor`, and `prototype`.
  
  A payload such as `{"message":"...","toString":"..."}` yields an `Error` whose `String(error)` and template interpolation work, and a payload carrying a callable `then` yields an `Error` that `await` resolves to rather than through. All other own enumerable fields (`code`, `statusCode`, ...) are still copied.
- 2348093: A `Try` instance now reports an error one time. Terminal methods share one cached execution, but each terminal call also called the reporter. A reused instance sent one Sentry event for each call. The instance now sends one event for each failure.
  
  A reporter that throws no longer breaks a terminal. `value()`, `error()`, and `result()` keep their never-throw contract, and `unwrap()` throws the wrapped original error. The reporter failure is logged with `console.error` when `.debug()` is enabled.
- 236fbd5: `Try.throwThroughErrorTypes` writes the same static slot that every throw-through check reads, so configuring the registry through a subclass takes effect: `class MyTry extends Try {}` followed by `MyTry.throwThroughErrorTypes(['ValidationError'])` exempts `ValidationError` for `MyTry` and `Try` alike.

## 1.1.0

### Minor Changes

- 97e3047: allow running both sync and async functions

## 1.0.1

### Patch Changes

- a7cd12a: Use tsup to build the library
- b4c8c1b: Fix breadcrumbs type safety

## 1.0.0

### Major Changes

- a745bb1: Stabilize the api

### Minor Changes

- 2e106d4: Improved developer experience and documentation.
