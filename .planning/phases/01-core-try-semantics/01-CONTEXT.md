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
- The function runs once and caches the outcome for subsequent accesses.
- For async functions, execution starts on first access (same lazy behavior).
- If a sync function returns a Promise, treat the Promise as a success value (no async handling).

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
