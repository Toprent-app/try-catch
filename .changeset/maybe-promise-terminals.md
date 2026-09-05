---
"@power-rent/try-catch": major
---

Sound terminal return types for Promise-typed functions: terminals that may settle sync or async are typed as `TValue | Promise<TValue>` (use `await`). `finally()` is on the public type surface only when the wrapped function's return type is fully Promise-like.

BREAKING CHANGE (types): terminal methods of a Promise-typed function return `TValue | Promise<TValue>`. Assigning a terminal result to `Promise<T>`, or calling `.then` on it, requires `await` or `Promise.resolve(...)`. `.finally()` is a type error on pure-sync and `T | Promise<T>` Try instances; the runtime method is unchanged and still reachable through a cast.

BREAKING CHANGE (types): `Try` is now a constructor value typed as `TryConstructor` rather than a class declaration, and `/nextjs` re-exports it instead of declaring its own subclass. `new Try(...)` and the statics (`setDefaultReporter`, `getDefaultReporter`, `throwThroughErrorTypes`) are unchanged, and `class MyTry extends Try {}` still type-checks, but code that referred to `Try` as a class type must use the exported `Try` / `PublicTry` type alias instead.

BREAKING CHANGE (types): fluent configuration methods (`report`, `breadcrumbs`, `tag`, `tags`, `debug`, `finally`) return `PublicTry<TReturn, TArgs, TDefault>`. Annotations and generic wrappers written against a chained call must name that type.
