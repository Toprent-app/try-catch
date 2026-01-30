# Testing Patterns

**Analysis Date:** 2026-01-30

## Test Framework

**Runner:**
- Vitest ^4.0.3
- Config: \`vite.config.ts\`

**Assertion Library:**
- Vitest \`expect\`

**Run Commands:**
```bash
npm test                    # vitest run
npm run test:watch          # vitest (watch mode)
npm test -- --coverage      # Coverage (v8 provider)
```

## Test File Organization

**Location:**
- Dedicated directory: \`src/__tests__\`

**Naming:**
- \`* .test.ts\`

**Structure:**
```
src/
└── __tests__/
    ├── Try.test.ts
    └── flexible-breadcrumbs.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('Try', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should return default value', async () => {
    const result = await new Try(fn).value();
    expect(result).toBe(defaultVal);
  });
});
```
From \`src/__tests__/Try.test.ts\`

**Patterns:**
- Setup: Inline factories \`async function throwingFunction() { throw new Error('boom'); }\`
- Teardown: \`afterEach(() => vi.clearAllMocks())\`
- Assertions: \`expect().toEqual()\`, \`expect(fn).toHaveBeenCalledWith()\`

## Mocking

**Framework:** Vitest \`vi\`

**Patterns:**
```typescript
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
```
From \`src/__tests__/Try.test.ts\`

**What to Mock:**
- External services (Sentry SDK), console

**What NOT to Mock:**
- Internal class methods, pure functions

## Fixtures and Factories

**Test Data:**
```typescript
const params = { parameterKey: 'alpha' };
const defaultVal = { value: 'fallback' };

async function throwingFunction(params: Record&lt;string, unknown&gt;): Promise&lt;{ok: boolean}&gt; {
  throw new Error('boom');
}
```
Inline per test in \`src/__tests__/*.test.ts\`

**Location:**
- Inline, no shared fixtures file

## Coverage

**Requirements:** v8 provider targeting \`src/**/*.ts\`

**View Coverage:**
```bash
npm test -- --coverage
```

## Test Types

**Unit Tests:**
- Try class behaviors, error paths, chaining in \`src/__tests__/Try.test.ts\`

**Integration Tests:**
- Not detected

**E2E Tests:**
- Not used

## Common Patterns

**Async Testing:**
```typescript
const exec = new Try(fn).unwrap();
await expect(exec).rejects.toThrow('boom');
```

**Error Testing:**
```typescript
const result = await new Try(fn).result();
if (!result.success) {
  expect(result.error.message).toBe('expected');
}
```
From \`src/__tests__/Try.test.ts\`, \`src/__tests__/flexible-breadcrumbs.test.ts\`

---

*Testing analysis: 2026-01-30*