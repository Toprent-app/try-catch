---
'@power-rent/try-catch': patch
---

A wrapped function whose `name` read throws (a Proxy-wrapped function) no longer breaks the terminal methods. Before, `.value()`, `.error()`, and `.result()` threw the getter error when `.breadcrumbs()` was configured, and `.report()` was dropped without breadcrumbs. The name read is now guarded and falls back to `'anonymous'`.
