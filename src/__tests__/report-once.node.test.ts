import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';

// Isolated scope mock so we can assert tags/breadcrumbs attached via withScope.
const { scopeMock } = vi.hoisted(() => ({
  scopeMock: { setTags: vi.fn(), addBreadcrumb: vi.fn() },
}));

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn((cb: (scope: typeof scopeMock) => void) => cb(scopeMock)),
}));

import * as Sentry from '@sentry/node';
import Try from '../node';
import { NodeReporter } from '../adapters/node/reporter';
import { installNodeScopeProvider } from '../adapters/node/scopeProvider';
import { NoopScopeProvider, getScopeProvider } from '../core/scope';

const captureException = Sentry.captureException as unknown as Mock;
const withScope = Sentry.withScope as unknown as Mock;

async function asyncThrow(): Promise<never> {
  throw new Error('boom');
}

async function asyncThrowWith(
  _params: Record<string, unknown>,
): Promise<never> {
  throw new Error('boom');
}

function syncThrow(): never {
  throw new Error('boom');
}

async function asyncOk(): Promise<string> {
  return 'ok';
}

function assembledFrom(call: number): Error {
  return captureException.mock.calls[call][0] as Error;
}

describe('report-once on /node (collector path)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    Try.throwThroughErrorTypes([]);
    // Reinstate the real reporter (one test swaps it for a capture-less stub).
    Try.setDefaultReporter(new NodeReporter());
  });

  it('un-nested value()+report() emits exactly one assembled event', async () => {
    const out = await new Try(asyncThrow).report('failed').value();

    expect(out).toBeUndefined();
    expect(withScope).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);

    const assembled = assembledFrom(0);
    expect(assembled.message).toBe('failed');
    expect((assembled.cause as Error).message).toBe('boom');
    // Stack is the leaf's stack — no Try/assembly frames.
    expect(assembled.stack).toBe((assembled.cause as Error).stack);
    expect(scopeMock.setTags).toHaveBeenCalledWith({
      library: '@power-rent/try-catch',
    });
  });

  it('merges tags into the isolated scope (boundary wins)', async () => {
    await new Try(asyncThrow).report('failed').tag('component', 'svc').value();

    expect(scopeMock.setTags).toHaveBeenCalledWith({
      component: 'svc',
      library: '@power-rent/try-catch',
    });
  });

  it('error()+report() now emits one event (previously zero)', async () => {
    const error = await new Try(asyncThrow).report('failed').error();

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('boom');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('result()+report() now emits one event (previously zero)', async () => {
    const result = await new Try(asyncThrow).report('failed').result();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('boom');
    }
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('unwrap()+report() emits once and throws the wrapped error', async () => {
    await expect(new Try(asyncThrow).report('failed').unwrap()).rejects.toThrow(
      'failed',
    );

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('reports even when recovering via default().value()', async () => {
    const out = await new Try(asyncThrow)
      .report('failed')
      .default('fallback')
      .value();

    expect(out).toBe('fallback');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not emit on success', async () => {
    const out = await new Try(asyncOk).report('failed').value();

    expect(out).toBe('ok');
    expect(withScope).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not emit on failure without .report() or breadcrumbs', async () => {
    await new Try(asyncThrow).value();

    expect(captureException).not.toHaveBeenCalled();
  });

  it('breadcrumb-only failure emits no event and adds no live breadcrumb', async () => {
    await new Try(asyncThrowWith, { id: 1 }).breadcrumbs(['id']).value();

    expect(captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('collects breadcrumb-only entries from anonymous functions', async () => {
    await new Try(
      async (_params: Record<string, unknown>): Promise<never> => {
        throw new Error('boom');
      },
      { id: 1 },
    )
      .breadcrumbs(['id'])
      .value();

    // No message → no event, but the breadcrumb-only entry is still collected
    // (exercising the anonymous function-name fallback).
    expect(captureException).not.toHaveBeenCalled();
  });

  it('attaches breadcrumbs to the event scope, never globally', async () => {
    await new Try(asyncThrowWith, { id: 1 })
      .report('failed')
      .breadcrumbs(['id'])
      .value();

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(scopeMock.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 1 } }),
    );
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('a failing capture cannot break value()', async () => {
    withScope.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });

    const out = await new Try(asyncThrow).report('failed').debug(false).value();

    expect(out).toBeUndefined();
  });

  it('sync value()+report() emits one event', () => {
    const out = new Try(syncThrow).report('failed').value();

    expect(out).toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('sync error()+report() emits and returns the error', () => {
    const error = new Try(syncThrow).report('failed').error();

    expect((error as Error).message).toBe('boom');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('sync result()+report() emits one event', () => {
    const result = new Try(syncThrow).report('failed').result();

    expect(result.success).toBe(false);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('sync unwrap()+report() emits once and throws the wrapped error', () => {
    expect(() => new Try(syncThrow).report('failed').unwrap()).toThrow(
      'failed',
    );
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('defaults the function name for anonymous functions', async () => {
    await new Try(async (): Promise<never> => {
      throw new Error('boom');
    })
      .report('failed')
      .value();

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('logs flush failure under debug but still does not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    withScope.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });

    const out = await new Try(asyncThrow).report('failed').debug(true).value();

    expect(out).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error in report-once flush',
      new Error('sentry down'),
    );
    consoleSpy.mockRestore();
  });

  it('multiple terminals on one instance emit at most once', async () => {
    const tryInstance = new Try(asyncThrow).report('failed');

    await tryInstance.value();
    await tryInstance.error();

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('throwThrough error still reports once and rethrows the original', async () => {
    class GraphQLError extends Error {
      name = 'GraphQLError';
    }
    Try.throwThroughErrorTypes(['GraphQLError']);

    await expect(
      new Try(async (): Promise<never> => {
        throw new GraphQLError('validation');
      })
        .report('failed')
        .unwrap(),
    ).rejects.toThrow('validation');

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('falls back to report() when the reporter has no capture()', async () => {
    const fallback = {
      report: vi.fn(),
      addBreadcrumbs: vi.fn(),
      createWrappedError: (error: Error, message: string) => {
        const wrapped = new Error(message);
        wrapped.cause = error;
        return wrapped;
      },
    };
    Try.setDefaultReporter(fallback);

    await new Try(asyncThrow).report('failed').value();

    expect(fallback.report).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('nested Try contributes to the boundary; one event at the boundary', async () => {
    async function inner(): Promise<never> {
      throw new Error('boom');
    }
    async function outer(): Promise<string> {
      await new Try(inner).report('inner failed').value();
      return 'recovered';
    }

    const out = await new Try(outer).report('outer failed').value();

    expect(out).toBe('recovered');
    expect(captureException).toHaveBeenCalledTimes(1);
    const assembled = assembledFrom(0);
    expect(assembled.message).toBe('inner failed');
    expect((assembled.cause as Error).message).toBe('boom');
  });

  it('overflow-flushes a long-lived boundary in batches (bounded buffer, no loss)', async () => {
    // A boundary that handles many distinct failures must not buffer them all
    // until it returns (unbounded memory + crash-loss). The buffer caps at
    // MAX_SCOPE_ERRORS (100) and flushes early, staying alive to keep collecting.
    const COUNT = 150; // > cap, so at least one overflow flush fires mid-boundary

    async function boundary(): Promise<number> {
      for (let i = 0; i < COUNT; i++) {
        // Distinct root + message each iteration; handled via value() so it
        // accumulates into the scope instead of flushing.
        await new Try(async (): Promise<never> => {
          throw new Error(`e${i}`);
        })
          .report(`m${i}`)
          .value();
      }
      // Evaluated before the boundary settles: an overflow flush has already
      // emitted a batch, so the buffer never held all COUNT errors at once.
      return captureException.mock.calls.length;
    }

    const emittedMidBoundary = await new Try(boundary)
      .report('boundary')
      .value();

    expect(emittedMidBoundary).toBeGreaterThan(0); // flushed before boundary returned
    expect(emittedMidBoundary).toBeLessThan(COUNT); // remainder flushes at the boundary
    // Every distinct root emits exactly once — overflow batching loses/dupes none.
    expect(captureException).toHaveBeenCalledTimes(COUNT);
  });

  it('a root spanning an overflow flush emits exactly once (report-once holds)', async () => {
    // 101 entries sharing ONE Error instance: the overflow flush at 100 emits
    // the root's group, then the final boundary flush sees the 101st entry with
    // the same root — which must NOT produce a second event.
    const COUNT = 101; // MAX_SCOPE_ERRORS + 1
    const shared = new Error('shared root');

    async function boundary(): Promise<string> {
      for (let i = 0; i < COUNT; i++) {
        await new Try(async (): Promise<never> => {
          throw shared;
        })
          .report(`m${i}`)
          .value();
      }
      return 'done';
    }

    const out = await new Try(boundary).report('boundary').value();

    expect(out).toBe('done');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('independent primitive throws keep per-entry events across overflow flushes', async () => {
    // Primitives carry no identity, so equal primitive throws never merge —
    // including across an overflow boundary (no root tracking for them).
    const COUNT = 101; // MAX_SCOPE_ERRORS + 1

    async function boundary(): Promise<string> {
      for (let i = 0; i < COUNT; i++) {
        await new Try(async (): Promise<never> => {
          throw 'boom';
        })
          .report(`m${i}`)
          .value();
      }
      return 'done';
    }

    await new Try(boundary).report('boundary').value();

    expect(captureException).toHaveBeenCalledTimes(COUNT);
  });
});

describe('NodeReporter legacy (non-collector) methods', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('report() captures the wrapped error when a message is given', () => {
    new NodeReporter().report(new Error('boom'), {
      message: 'failed',
      tags: { a: 'b' },
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = captureException.mock.calls[0];
    expect((error as Error).message).toBe('failed');
    expect((hint as { tags: Record<string, string> }).tags).toEqual({
      a: 'b',
      library: '@power-rent/try-catch',
    });
  });

  it('report() captures the raw error when no message is given', () => {
    const raw = new Error('boom');
    new NodeReporter().report(raw, { tags: {} });

    expect(captureException).toHaveBeenCalledWith(raw, {
      tags: { library: '@power-rent/try-catch' },
    });
  });

  it('addBreadcrumbs() forwards to Sentry with the function name', () => {
    new NodeReporter().addBreadcrumbs({ id: 1 }, 'fn');

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling fn function',
        data: { id: 1 },
      }),
    );
  });

  it('addBreadcrumbs() defaults the function name to anonymous', () => {
    new NodeReporter().addBreadcrumbs({ id: 1 });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Calling anonymous function' }),
    );
  });

  it('capture() defaults a breadcrumb function name to anonymous', () => {
    new NodeReporter().capture(new Error('x'), {
      tags: {},
      breadcrumbs: [{ data: { id: 1 } }],
    });

    expect(scopeMock.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling anonymous function',
        data: { id: 1 },
      }),
    );
  });
});

describe('installNodeScopeProvider', () => {
  it('is idempotent when a collector is already installed', () => {
    const before = getScopeProvider();
    installNodeScopeProvider();
    expect(getScopeProvider()).toBe(before);
  });

  it('reuses the shared ALS after the provider is reset', () => {
    Try.setScopeProvider(new NoopScopeProvider());
    installNodeScopeProvider();
    expect(getScopeProvider().collects).toBe(true);
  });
});
