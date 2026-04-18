# Phase 1: Core Try Semantics - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a type-safe Try API for sync and async error handling, including `new Try(fn, ...args)`, `.value()`, `.error()`, `.unwrap()`, and `.default(value)`.

</domain>

<decisions>
## Implementation Decisions

### Execution timing
- `new Try(fn, ...args)` is lazy: it does not call `fn` until first access.
- "First access" = `.value()`, `.error()`, `.result()`, `.unwrap()`, or `await` (thenable).
- The function runs once and caches the outcome for subsequent accesses.
- For `AsyncFunction`, the instance is thenable up front (eager `then` install).
- For non-async functions, `then` is a getter that runs `fn` once on access; if the return is a Promise, the instance becomes thenable, otherwise `then` is set to `undefined` and `await` yields the Try itself.
- Both sync and async are supported uniformly: `new Try(syncFn).value()` and `await new Try(asyncFn)` both work.

### Claude's Discretion
None specified.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-core-try-semantics*
*Context gathered: 2026-01-31*
