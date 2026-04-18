---
'@power-rent/try-catch': patch
---

Fix MD-05: `.breadcrumbs(...)` no longer invokes the reporter's `addBreadcrumbs` (`Sentry.addBreadcrumb`) when the extracted data is empty (e.g. `.breadcrumbs([])`, transformer errors, or extraction against a primitive). Empty breadcrumb events are now suppressed rather than recorded as no-op entries.
