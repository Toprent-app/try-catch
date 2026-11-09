---
'@power-rent/try-catch': minor
---

Type the terminals of an async function as `Promise<T>`. When the wrapped function always returns a Promise, `.value()`, `.unwrap()`, `.error()` and `.result()` now return `Promise<…>`. You can chain `.then()` or assign the result to a `Promise<T>` without `Promise.resolve(...)`.

Functions typed `T | Promise<T>` or `any` keep the `T | Promise<T>` terminal type. Runtime behavior does not change. Mark each function that returns a Promise as `async`: a plain function typed `(): Promise<T>` that throws before it returns settles synchronously.
