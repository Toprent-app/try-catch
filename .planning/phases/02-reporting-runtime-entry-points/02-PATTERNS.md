# Phase 2: Reporting + Runtime Entry Points - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 6 files to modify, 3 test files to create
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/Try.ts` | core class | event-driven | `src/core/Try.ts` (self) | exact |
| `src/adapters/node/reporter.ts` | adapter/service | request-response | `src/adapters/browser/reporter.ts` | exact |
| `src/adapters/browser/reporter.ts` | adapter/service | request-response | `src/adapters/node/reporter.ts` | exact |
| `src/nextjs/SentryReporter.ts` | adapter/service | request-response | `src/adapters/node/reporter.ts` | role-match |
| `src/browser/index.ts` | entry point / config | request-response | `src/node/index.ts` | exact |
| `src/node/index.ts` | entry point / config | request-response | `src/browser/index.ts` | exact |
| `src/nextjs/index.ts` | entry point / config | request-response | `src/node/index.ts` | role-match |
| `src/__tests__/adapters/node.test.ts` | test | request-response | `src/__tests__/Try.test.ts` | role-match |
| `src/__tests__/adapters/browser.test.ts` | test | request-response | `src/__tests__/Try.test.ts` | role-match |
| `src/__tests__/adapters/nextjs.test.ts` | test | request-response | `src/__tests__/Try.test.ts` | role-match |

---

## Pattern Assignments

### `src/core/Try.ts` — three targeted edits

**Analog:** `src/core/Try.ts` (self)

#### Edit 1: Non-Error normalization in `execute()` (D-01 through D-04)

Both catch sites in `execute()` (sync catch block lines 791–797, async `.catch()` handler lines 770–776) currently cast the caught value directly to `Error`. Replace that cast with a normalization helper.

Current pattern (lines 791–797 for sync; lines 770–776 for async):
```typescript
} catch (e) {
  if (this.config.debug) {
    console.error(e);
  }
  const error = e as Error;
  this.exec.isAsync = false;
  this.exec.result = { success: false, error };
```

Target pattern — apply at both catch sites:
```typescript
const error = e instanceof Error
  ? e
  : (() => {
      const wrapped = new Error(`Non-Error thrown (${typeof e})`);
      wrapped.cause = e;
      return wrapped;
    })();
```

Error wrapping convention is sourced from `src/core/reporter.ts` lines 52–57:
```typescript
createWrappedError(error: Error, message: string): Error {
  const wrappedError = new Error(message);
  wrappedError.cause = error;
  wrappedError.stack = error.stack;
  return wrappedError;
}
```
Note: for normalization, do NOT copy `.stack` — the thrown non-Error has no stack to copy. Only set `cause`.

#### Edit 2: Breadcrumb consistency across all terminal methods (D-06)

`value()` (lines 698–736) already calls `addBreadcrumbsIfConfigured()` in its error branch. The same call is absent from `unwrap()` and `error()`. Pattern from `value()` (lines 703–709):

```typescript
if (resolved.success) {
  return resolved.value;
}

if (this.config.message) {
  this.reportError(resolved.error);
} else if (this.config.breadcrumbConfig) {
  this.addBreadcrumbsIfConfigured();
}
```

Apply the same `else if (this.config.breadcrumbConfig) { this.addBreadcrumbsIfConfigured(); }` guard to:
- `unwrap()` async branch (after `shouldCapture` check, lines 523–544)
- `unwrap()` sync branch (after `shouldCapture` check, lines 548–566)
- `error()` async branch (lines 650–653)
- `error()` sync branch (lines 656–660)

For `error()`, since there is no `config.message` guard today, add:
```typescript
if (this.config.breadcrumbConfig) {
  this.addBreadcrumbsIfConfigured();
}
```
in the failure branch before returning the error.

---

### `src/nextjs/SentryReporter.ts` — remove internal breadcrumb double-add (D-07)

**Analog:** `src/adapters/node/reporter.ts` (lines 9–17) — BrowserReporter and NodeReporter do NOT call `addBreadcrumbs` inside `report()`.

Current `SentryReporter.report()` (lines 12–29) calls `this.addBreadcrumbs()` internally:
```typescript
report(error: Error, config: ErrorReportConfig): void {
  // Add breadcrumbs if configured
  if (
    config.breadcrumbData &&
    Object.keys(config.breadcrumbData).length > 0
  ) {
    this.addBreadcrumbs(config.breadcrumbData, config.functionName);
  }
  // ...
}
```

Target pattern (copy from `src/adapters/node/reporter.ts` lines 9–17):
```typescript
report(error: Error, config: ErrorReportConfig): void {
  const errorToReport = config.message
    ? this.createWrappedError(error, config.message)
    : error;

  Sentry.captureException(errorToReport, {
    tags: { ...config.tags, library: '@power-rent/try-catch' },
  });
}
```

Remove the internal `addBreadcrumbs` call entirely. The Try class calls `addBreadcrumbsIfConfigured()` before `reportError()`, which already calls `Try.defaultReporter.addBreadcrumbs()`.

---

### `src/__tests__/adapters/node.test.ts` (new test file)

**Analog:** `src/__tests__/Try.test.ts` (lines 1–13 for mock setup, lines 36–41 for describe/afterEach)

**Mock setup pattern** (lines 1–13 of Try.test.ts):
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import Try from '../nextjs';

vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

import * as Sentry from '@sentry/nextjs';
```

For node adapter test — adapt to node:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { NodeReporter } from '../../adapters/node/reporter';
```

**Reporter injection pattern** (from CONTEXT.md code_context):
```typescript
let reporter: NodeReporter;

beforeEach(() => {
  reporter = new NodeReporter();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Core test pattern** — verify `captureException` called with correct wrapped error and tags (from Try.test.ts lines 272–282):
```typescript
it('report() calls captureException with wrapped error and tags', () => {
  const original = new Error('boom');
  reporter.report(original, {
    message: 'wrapped message',
    tags: { env: 'test' },
  });

  const expectedError = new Error('wrapped message');
  expectedError.cause = original;

  expect(Sentry.captureException).toBeCalledWith(expectedError, {
    tags: { library: '@power-rent/try-catch', env: 'test' },
  });
});
```

**Breadcrumb test pattern** (from Try.test.ts lines 222–237):
```typescript
it('addBreadcrumbs() calls Sentry.addBreadcrumb with function name', () => {
  reporter.addBreadcrumbs({ userId: 123 }, 'fetchUser');

  expect(Sentry.addBreadcrumb).toBeCalledWith({
    message: 'Calling fetchUser function',
    data: { userId: 123 },
  });
});
```

**createWrappedError test pattern** (from reporter.ts lines 52–57):
```typescript
it('createWrappedError sets cause and preserves stack', () => {
  const original = new Error('original');
  const wrapped = reporter.createWrappedError(original, 'wrapper');

  expect(wrapped.message).toBe('wrapper');
  expect(wrapped.cause).toBe(original);
  expect(wrapped.stack).toBe(original.stack);
});
```

---

### `src/__tests__/adapters/browser.test.ts` (new test file)

**Analog:** `src/__tests__/adapters/node.test.ts` (mirror pattern)

Identical structure to node test, swap:
- `@sentry/node` → `@sentry/browser`
- `NodeReporter` → `BrowserReporter`
- import path: `../../adapters/browser/reporter`

---

### `src/__tests__/adapters/nextjs.test.ts` (new test file)

**Analog:** `src/__tests__/adapters/node.test.ts` + `src/__tests__/Try.test.ts` lines 80–97

Identical structure but:
- `@sentry/nextjs` → mock target
- `SentryReporter` from `../../nextjs/SentryReporter`

Additional test unique to nextjs — verify no double-add after D-07 fix:
```typescript
it('report() does NOT call addBreadcrumb internally', () => {
  const original = new Error('boom');
  reporter.report(original, {
    message: 'msg',
    tags: {},
    breadcrumbData: { foo: 'bar' },
    functionName: 'doThing',
  });

  // addBreadcrumb must not be called from inside report()
  expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
});
```

---

### Entry points: `src/browser/index.ts`, `src/node/index.ts`, `src/nextjs/index.ts`

These are verify-only — no changes expected. The existing pattern (lines 1–6 of each):

```typescript
// node/index.ts pattern (lines 1–6)
export { Try, Try as default, TryResult } from '../core/Try';
import { Try as TryClass } from '../core/Try';
import { NodeReporter } from '../adapters/node/reporter';

TryClass.setDefaultReporter(new NodeReporter());
```

Verify each entry point calls `setDefaultReporter` with the correct adapter. No structural changes needed unless verification reveals missing exports.

---

## Shared Patterns

### Error Wrapping (createWrappedError)
**Source:** `src/core/reporter.ts` lines 52–57 (`NoopReporter.createWrappedError`)
**Apply to:** Non-Error normalization in `src/core/Try.ts`
```typescript
const wrappedError = new Error(message);
wrappedError.cause = error;
wrappedError.stack = error.stack;
return wrappedError;
```
For non-Error normalization, omit `.stack` copy (no `.stack` on primitives). Only `message` and `cause`.

### Sentry Mock Setup
**Source:** `src/__tests__/Try.test.ts` lines 6–11
**Apply to:** All three new adapter test files
```typescript
vi.mock('@sentry/<platform>', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
```

### Reporter Test Lifecycle
**Source:** `src/__tests__/Try.test.ts` lines 37–41
**Apply to:** All three new adapter test files
```typescript
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
```

### captureException Tag Shape
**Source:** `src/__tests__/Try.test.ts` lines 272–282
**Apply to:** All reporter `report()` tests
```typescript
expect(Sentry.captureException).toBeCalledWith(expectedError, {
  tags: { library: '@power-rent/try-catch', ...userTags },
});
```
The `library` tag is always injected. Tests must include it in the expected call shape.

---

## No Analog Found

All files in scope have close analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/core/`, `src/adapters/`, `src/nextjs/`, `src/browser/`, `src/node/`, `src/__tests__/`
**Files scanned:** 10 source files, 4 existing test files
**Pattern extraction date:** 2026-04-17
