---
'@power-rent/try-catch': minor
---

A single settled execution reports each distinct `.report()` message at most once.

The guard is keyed by `(execution, message)`. `.default()` produces a clone that shares the parent's execution, so a parent and clone carrying the same message yield one report, while clones carrying divergent messages each report their own. Repeated terminal calls on one instance are covered by the same key: an instance with `.report('m')` whose terminals are called three times yields one report.

Applications that read a failure more than once — a `.value()` followed by an `.error()`, or a `.default()` chain consumed at both ends — see their Sentry event count for that failure drop to one.
