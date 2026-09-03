---
'@power-rent/try-catch': patch
---

A `Try` instance now reports an error one time. Terminal methods share one cached execution, but each terminal call also called the reporter. A reused instance sent one Sentry event for each call. The instance now sends one event for each failure.

A reporter that throws no longer breaks a terminal. `value()`, `error()`, and `result()` keep their never-throw contract, and `unwrap()` throws the wrapped original error. The reporter failure is logged with `console.error` when `.debug()` is enabled.
