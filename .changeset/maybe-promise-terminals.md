---
"@power-rent/try-catch": major
---

Sound terminal return types for Promise-typed functions: terminals that may settle sync or async are typed as `T | Promise<T>` (use `await`). `finally()` is only on the public type surface when the wrapped function's return type is fully Promise-like.

BREAKING CHANGE (types): Promise-typed terminal methods are no longer typed as always-`Promise`; callers assigning to `Promise<T>` or calling `.then` without `await`/`Promise.resolve` may need updates. `.finally()` is a type error on pure-sync and `T | Promise<T>` Try instances.
