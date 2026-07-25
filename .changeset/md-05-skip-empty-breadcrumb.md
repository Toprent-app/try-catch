---
'@power-rent/try-catch': patch
---

Fix MD-05: `.breadcrumbs(...)` calls the reporter's `addBreadcrumbs` (`Sentry.addBreadcrumb`) only when the extracted data is non-empty. Configurations that yield nothing — `.breadcrumbs([])`, a throwing transformer, or extraction against a primitive — record no breadcrumb event.
