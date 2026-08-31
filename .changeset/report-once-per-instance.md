---
'@power-rent/try-catch': patch
---

A `Try` instance now reports an error one time. Terminal methods share one cached execution, but each terminal call also called the reporter. A reused instance sent one Sentry event for each call. The instance now sends one event for each failure.
