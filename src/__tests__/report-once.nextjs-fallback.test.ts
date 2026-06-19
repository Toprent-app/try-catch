import { describe, it, expect, vi, afterAll } from 'vitest';

// Node runtime, but async_hooks lacks AsyncLocalStorage → installer must fall
// back to the legacy path instead of crashing the module.
vi.hoisted(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
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
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getScopeProvider().collects).toBe(false);
  });
});
