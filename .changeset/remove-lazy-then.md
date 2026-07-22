---
'@power-rent/try-catch': major
---
Remove lazy `.then` getter from non-async Try instances. Only `AsyncFunction` is now thenable. If you wrapped a non-async function returning a Promise and used `await new Try(fn)`, switch to `new Try(fn).unwrap()` or mark the function `async`.
