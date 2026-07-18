import { describe, it, expect, vi, afterAll, type Mock } from 'vitest';

// installNextjsCollector only activates on the Node.js runtime. Set this before
// the entry is imported so the collector install runs.
vi.hoisted(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
});

const { scopeMock } = vi.hoisted(() => ({
  scopeMock: { setTags: vi.fn(), addBreadcrumb: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn((cb: (scope: typeof scopeMock) => void) => cb(scopeMock)),
}));

import * as Sentry from '@sentry/nextjs';
import Try from '../nextjs';
import { getScopeProvider } from '../core/scope';

const captureException = Sentry.captureException as unknown as Mock;

// ---------------------------------------------------------------------------
// Everything below the imports runs in the SAME synchronous tick as the entry
// module's evaluation — before any microtask (i.e. before an async dynamic
// import of node:async_hooks could resolve). This is the cold-start window: a
// Try chain here must already aggregate instead of double-reporting.
// ---------------------------------------------------------------------------

const collectsAtLoadTick = getScopeProvider().collects;

function inner(): never {
  throw new Error('boom');
}
function outer(): string {
  return new Try(inner).report('inner failed').unwrap();
}
new Try(outer).report('outer failed').error();

const eventsAtLoadTick = captureException.mock.calls.map(
  (call) => (call[0] as Error).message,
);
const assembledAtLoadTick = captureException.mock.calls[0]?.[0] as
  | Error
  | undefined;

describe('nextjs collector cold start (same tick as entry-module load)', () => {
  afterAll(() => {
    delete process.env.NEXT_RUNTIME;
  });

  it('the collector is installed synchronously at module evaluation', () => {
    expect(collectsAtLoadTick).toBe(true);
  });

  it('a chain failing in the load tick aggregates into one event (no double-report)', () => {
    expect(eventsAtLoadTick).toEqual(['outer failed']);
    expect((assembledAtLoadTick?.cause as Error).message).toBe('inner failed');
    expect(((assembledAtLoadTick?.cause as Error).cause as Error).message).toBe(
      'boom',
    );
  });
});
