---
'@power-rent/try-catch': patch
---

Terminal methods of a function typed `any` now return `TValue | Promise<TValue>`. `.finally()` is a type error on `any` and `never` Try instances. `TryImpl` is no longer exported from the core barrel, and `TryResult` is a type-only export on every entry point. The `finally()` documentation states that a callback on the synchronous path is not awaited.
