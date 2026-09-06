---
'@power-rent/try-catch': patch
---

A breadcrumb key whose read throws no longer escapes the terminal methods. `.breadcrumbs(['id'])` reads `arg.id`, and an argument with a throwing getter or a Proxy trap made `.value()`, `.error()`, and `.result()` throw and made `.unwrap()` throw the getter error instead of the wrapped error. The extractor now skips that key, records the other keys, and logs the read error with `console.error` when `.debug()` is enabled.
