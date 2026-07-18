import { describe, it, expect, vi, afterAll } from 'vitest';

// Node runtime on an older Node without `process.getBuiltinModule` → the
// installer must fall back to the async dynamic import of node:async_hooks
// (left unmocked here, so a real AsyncLocalStorage resolves) and have the
// collector live once module initialization settles — before request handling.
vi.hoisted(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
  (process as { getBuiltinModule?: unknown }).getBuiltinModule = undefined;
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn(),
}));

import '../nextjs';
import { getScopeProvider } from '../core/scope';

describe('nextjs collector async dynamic-import fallback', () => {
  afterAll(() => {
    delete process.env.NEXT_RUNTIME;
  });

  it('installs the collector via dynamic import when getBuiltinModule is unavailable', async () => {
    await vi.waitFor(() => expect(getScopeProvider().collects).toBe(true), {
      timeout: 1000,
    });
  });
});
