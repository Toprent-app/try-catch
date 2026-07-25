---
'@power-rent/try-catch': major
---

100% type-safe: eliminate all `any` from src. Breaking changes:
- `BreadcrumbTransformer<T>` input narrowed from `any` to `unknown` — transformers with typed params need adjustment
- `Try` gains 3rd generic `TDefault = undefined` (source-compatible default)
- `.default()` returns a fresh `Try` instance carrying its own config. A reference held before `.default()` keeps the configuration it had, and `.report()`/`.tag()` calls made on the chain after `.default()` apply only to the clone.
- Execution state — cached result, promise, breadcrumb emission, report emission, and finally-callback bookkeeping — is shared across a `.default()` chain. `fn` runs once, each `finally` callback reference runs once, and each distinct breadcrumb config and `.report()` message is emitted once, however many terminals are called on the pre- and post-`.default()` references.
- Deprecated `ErrorReporter` class removed — use `Reporter` interface
- ESLint flat config added with strict type-checked rules
