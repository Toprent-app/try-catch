import { describe, it, expect, vi, afterAll } from 'vitest';

// Node runtime, but AsyncLocalStorage is unavailable → the installer must stay
// on the legacy path, not crash. Disable the synchronous install path
// (process.getBuiltinModule) and resolve the dynamic-import fallback to a
// module without AsyncLocalStorage.
vi.hoisted(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
  (process as { getBuiltinModule?: unknown }).getBuiltinModule = undefined;
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('node:async_hooks', () => ({}));

import '../nextjs';
import { getScopeProvider } from '../core/scope';

describe('nextjs collector fallback', () => {
  afterAll(() => {
    delete process.env.NEXT_RUNTIME;
  });

  it('stays on the legacy path when AsyncLocalStorage is unavailable', async () => {
    // Settle the installer's guarded dynamic-import fallback first: awaiting
    // the same (mocked) module and yielding a macrotask orders this assertion
    // after the installer's .then chain, so the negative expectation is
    // meaningful instead of trivially true at t=0.
    await import('node:async_hooks');
    await new Promise((resolve) => setImmediate(resolve));
    expect(getScopeProvider().collects).toBe(false);
  });
});
