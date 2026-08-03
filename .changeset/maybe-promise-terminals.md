---
"@power-rent/try-catch": major
---

Sound terminal return types for Promise-typed functions: terminals that may settle sync or async are typed as `TValue | Promise<TValue>` (use `await`). `finally()` is on the public type surface when the wrapped function's return type is fully Promise-like.

BREAKING CHANGE (types): terminal methods of a Promise-typed function return `TValue | Promise<TValue>`. Assigning a terminal result to `Promise<T>`, or calling `.then` on it, requires `await` or `Promise.resolve(...)`. `.finally()` is a type error on pure-sync and `T | Promise<T>` Try instances.

BREAKING CHANGE (types): `/nextjs` exports the core `Try` constructor value, typed as `TryConstructor`. Subclassing it is a type error — `class MyTry extends Try {}` reports `TS2508`, and `class MyTry extends Try<Promise<number>, [number]> {}` reports `TS2417`. Wrap a `Try` instance behind your own class or function.

BREAKING CHANGE (types): fluent configuration methods (`report`, `breadcrumbs`, `tag`, `tags`, `debug`, `finally`) return `PublicTry<TReturn, TArgs>`. Annotations and generic wrappers written against a chained call must name that type.
