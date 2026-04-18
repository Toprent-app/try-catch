# Deferred Items — Phase 03

Out-of-scope discoveries logged during execution per scope-boundary rule.

## Pre-existing lint errors in `src/__tests__/Try.test.ts`

Found during 03-01 execution via `npm run lint`.

- Lines 1803, 1812, 1821, 1829: `@typescript-eslint/only-throw-error` —
  `throw <non-Error>` patterns that the rule rejects.
- These predate Phase 03; not caused by the doctest harness.
- Fix in a future housekeeping plan.
