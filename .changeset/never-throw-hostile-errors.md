---
'@power-rent/try-catch': patch
---

`value()`, `error()`, and `result()` return, and `unwrap()` throws only the error it wrapped, for errors carrying accessors that throw.

`name` and `stack` are read through guarded helpers, so a caught value that passes `instanceof Error` but defines `get name()` or `get stack()` as a throwing accessor — a Proxy wrapper from an ORM, mock, or observability layer, or a subclass with a computed `name` — resolves to `''`/`undefined` and flows through the throw-through check and error wrapping normally.
