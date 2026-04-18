---
'@power-rent/try-catch': patch
---

Fix HI-02: errors matching `Try.throwThroughErrorTypes` are no longer reported to Sentry when `.report()` is set. Previously the error was sent to `Sentry.captureException` before being re-thrown unwrapped, contradicting the "throw-through" name. Breadcrumbs configured via `.breadcrumbs()` are still recorded.
