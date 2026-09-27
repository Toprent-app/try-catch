---
"@power-rent/try-catch": patch
---

Fix three edge cases in error reporting and breadcrumbs.

- `.report('')` reports the error. `.unwrap()` throws the error wrapped with the empty message, and the Sentry reporters send that same wrapped error.
- `createWrappedError` keeps the stack of the new error when the original error has no string `stack`.
- A breadcrumb key named `__proto__` is recorded as a data property. Its value stays in the breadcrumb data, and the prototype of the breadcrumb data object does not change.
