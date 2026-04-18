---
phase: 01-core-try-semantics
status: complete
verified: 2026-04-17
---

## Phase 1: Core Try Semantics — Summary

Type-safe `Try` API for sync + async error handling, delivered in `src/core/Try.ts`.

### Delivered

| Capability | Location |
|---|---|
| `new Try(fn, ...args)` constructor | `src/core/Try.ts:145` |
| `.value()` — returns value or default/undefined | `src/core/Try.ts:691` |
| `.error()` — returns Error or undefined | `src/core/Try.ts:647` |
| `.unwrap()` — returns value or throws | `src/core/Try.ts:519` |
| `.result()` — returns `TryResult<T>` discriminated union | `src/core/Try.ts:610` |
| `.default(value)` — sets fallback for `.value()` | `src/core/Try.ts:486` |

### Execution semantics

- **Lazy:** `fn` not invoked at construction. Runs on first `.value()`, `.error()`, `.result()`, `.unwrap()`, or `await`.
- **Cached:** result memoized; subsequent calls reuse it (`exec.state === 'executed'` guard, `Try.ts:747`).
- **Sync + async unified:**
  - `AsyncFunction` → eager thenable install (`installThenable`, `Try.ts:172`).
  - Non-async → lazy `.then` getter (`installLazyThenable`, `Try.ts:196`); on first access, runs `fn` once, switches to thenable if return is a Promise, otherwise sets `then = undefined` so `await` yields the Try itself.
- Both `new Try(syncFn).value()` and `await new Try(asyncFn)` are supported.

### Tests

- `src/__tests__/Try.test.ts` (115 tests)
- `src/__tests__/all-usecases.test.ts` (47 tests)
- `src/__tests__/type-safety.test.ts` (8 tests)
- `src/__tests__/flexible-breadcrumbs.test.ts` (23 tests)
- **Total: 193/193 passing**

### Notes

Phase executed outside GSD plan/execute flow. Original CONTEXT decision said "sync fn returning Promise → treat as opaque value". Reversed during implementation (commits `886a133`, `2a568a1`) so `await new Try(syncFnReturningPromise)` works. CONTEXT updated to match.
