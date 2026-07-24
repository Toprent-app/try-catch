---
'@power-rent/try-catch': patch
---

Preserve custom error identity during error normalization. Values that fail
`instanceof Error` — cross-realm/bundled Errors, transpiled `extends Error`
subclasses, and error-like objects (`{ name, message, stack, code, ... }`) — are
no longer flattened to `new Error(String(value))`. `toError` now reconstructs a
real `Error` that keeps `name` (so `throwThroughErrorTypes`/`ignoreErrorTypes`
matching and Sentry grouping work), `message`, `stack`, every own enumerable
custom field, and the original via `cause`. The never-throw contract is retained.
