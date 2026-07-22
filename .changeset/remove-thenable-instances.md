---
'@power-rent/try-catch': major
---
Remove thenable behavior from `Try` instances entirely. No `Try` instance is ever thenable — `await new Try(fn)` yields the `Try` instance itself regardless of whether the wrapped function is sync or async. Callers must use `.value()`, `.unwrap()`, `.error()`, or `.result()` to execute and read the result. Migration: replace `await new Try(asyncFn, ...args)` with `await new Try(asyncFn, ...args).value()` (or `.unwrap()` / `.result()` / `.error()` depending on desired semantics).
