---
"@power-rent/try-catch": major
---

`error()` and `result()` now honor `.report()`. Previously they returned the error/result without reporting even when `.report()` was configured; now they report the error (matching `value()`/`unwrap()`) before returning it. This is breaking for anyone relying on `error()`/`result()` staying silent when `.report()` is set.
