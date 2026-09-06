---
'@power-rent/try-catch': patch
---

`ErrorReportConfig.functionName` is now `'anonymous'` when the wrapped function has no name. Before, `Reporter.report()` received an empty string while `Reporter.addBreadcrumbs()` received `'anonymous'` for the same call.
