# Phase 2: Reporting + Runtime Entry Points - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 02-reporting-runtime-entry-points
**Areas discussed:** Non-Error normalization

---

## Gray Areas Presented

| Area | Selected |
|------|----------|
| Non-Error normalization (DIAG-01) | ✓ |
| Debug mode semantics (DIAG-02) | |
| Breadcrumb recording scope (SENT-03) | |
| Adapter consistency (nextjs double-add bug) | |

---

## Non-Error Normalization

### Wrapping strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Stringify it | `new Error(String(thrown))` — thrown value becomes the message | |
| Wrap with cause | `new Error('Non-Error thrown')` + `cause: thrown` — preserves original | ✓ |
| Best-effort | Check for `.message` first, fall back to stringify | |

**User's choice:** Wrap with cause — follows the Error cause pattern already used in the codebase.

### Normalization site

| Option | Description | Selected |
|--------|-------------|----------|
| In `execute()` | Catch-site; applies to sync and async paths centrally | ✓ |
| In `reportError()` | Only normalizes when reporting | |
| In each adapter | Independent per adapter | |

**User's choice:** In `execute()` — centralizes the fix.

### Error message format

| Option | Description | Selected |
|--------|-------------|----------|
| `'Non-Error thrown'` | Generic | |
| `'Unknown error'` | Common convention | |
| Include type | `'Non-Error thrown (string)'` — type info for debugging | ✓ |

**User's choice:** Include the typeof in the message.

### Error-like pass-through

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — pass through `instanceof Error` | Avoids surprises for custom Error subclasses | ✓ |
| No — only `instanceof Error` gets pass-through | Strict check | |

**User's choice:** `instanceof Error` values pass through without wrapping.

### Testing

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add explicit tests | Cover strings, numbers, plain objects | ✓ |
| No — existing tests sufficient | | |

**User's choice:** Add explicit tests for non-Error throws.

---

## Claude's Discretion

- **Debug mode behavior:** Keep existing supplemental pattern (console.error alongside Sentry). Not selected for discussion — existing implementation satisfies DIAG-02.
- **Breadcrumb scope:** Per SENT-03 requirement, applied consistently across all execution paths. Not selected for discussion — requirement is clear.
- **Adapter consistency (nextjs double-add):** Fix `SentryReporter.report()` to remove internal `addBreadcrumbs()` call. Not selected for discussion — clear technical bug.

## Deferred Ideas

None.
