---
'@power-rent/try-catch': major
---

100% type-safe: eliminate all `any` from src. Breaking changes:
- `BreadcrumbTransformer<T>` input narrowed from `any` to `unknown` — transformers with typed params need adjustment
- `Try` gains 3rd generic `TDefault = undefined` (source-compatible default)
- `.default()` now returns a fresh `Try` instance instead of mutating. Holding a reference before `.default()` no longer sees subsequent `.report()`/`.tag()` calls made on the chain after `.default()`. Execution state (cached result, promise, breadcrumb data, finally-callback) is shared across the chain, so `fn` and `finally` callback run exactly once even if terminal methods are called on both the pre- and post-`.default()` references.
- Deprecated `ErrorReporter` class removed — use `Reporter` interface
- ESLint flat config added with strict type-checked rules
