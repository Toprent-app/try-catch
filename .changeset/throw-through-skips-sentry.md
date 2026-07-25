---
'@power-rent/try-catch': minor
---

Fix HI-02: errors whose `name` is registered with `Try.throwThroughErrorTypes` are exempt from reporting. With `.report()` set, a matching error is re-surfaced unwrapped and reaches no reporter, on all four terminals and on both the sync and async paths. Breadcrumbs configured via `.breadcrumbs()` are still recorded, so the context leading up to an expected domain error stays available.

Sentry volume drops for applications that register throw-through types, and those errors stop appearing as issues.
