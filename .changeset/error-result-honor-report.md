---
'@power-rent/try-catch': major
---

`error()` and `result()` honor `.report()`. All four terminals — `value()`, `unwrap()`, `error()`, `result()` — send the failure to the configured `Reporter` when `.report()` is set, so reading a failure through `error()`/`result()` on a chain carrying `.report()` produces a Sentry event.
