import { describe, it, expect, vi, afterAll } from 'vitest';

// Node runtime, but the dynamic import resolves a module without
// AsyncLocalStorage → the installer must stay on the legacy path, not crash.
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
