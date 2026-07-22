---
'@power-rent/try-catch': major
---

100% type-safe: eliminate all `any` from src. Breaking changes:
- `BreadcrumbTransformer<T>` input narrowed from `any` to `unknown` — transformers with typed params need adjustment
- `Try` gains 3rd generic `TDefault = undefined` (source-compatible default)
- `.then` typed `never` AND not installed at runtime when wrapping sync functions — use `.value()` / `.unwrap()` synchronously. `await new Try(syncFn)` returns the `Try` instance itself (previously it would silently unwrap). Note: a plain (non-`async`) function that returns a `Promise` is treated as sync for `.then` installation — `await new Try(plainFnReturningPromise)` also returns the `Try` instance; call `.value()` explicitly, or declare the function `async`.
- `.default()` now returns a fresh `Try` instance instead of mutating. Holding a reference before `.default()` no longer sees subsequent `.report()`/`.tag()` calls made on the chain after `.default()`. Execution state (cached result, promise, breadcrumb data, finally-callback) is shared across the chain, so `fn` and `finally` callback run exactly once even if terminal methods are called on both the pre- and post-`.default()` references.
- Deprecated `ErrorReporter` class removed — use `Reporter` interface
- ESLint flat config added with strict type-checked rules
