import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';

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
import { NoopScopeProvider } from '../core/scope';

const captureException = Sentry.captureException as unknown as Mock;

function eventAt(call: number): Error {
  return captureException.mock.calls[call][0] as Error;
}

describe('Try.scope() — sibling aggregation boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Some tests swap the provider/reporter; reinstate the collector defaults.
    installNodeScopeProvider();
    Try.setDefaultReporter(new NodeReporter());
  });

  it('two sibling failures sharing one root aggregate into ONE event', async () => {
    const shared = new Error('shared root');

    const out = await Try.scope(async () => {
      await new Try(async (): Promise<never> => {
        throw shared;
      })
        .report('sibling A')
        .value();
      await new Try(async (): Promise<never> => {
        throw shared;
      })
        .report('sibling B')
        .value();
      return 'done';
    });

    expect(out).toBe('done');
    expect(captureException).toHaveBeenCalledTimes(1);
    // Assembled chain: later sibling outermost, shared root as the leaf.
    expect(eventAt(0).message).toBe('sibling B');
    expect((eventAt(0).cause as Error).message).toBe('sibling A');
    expect(((eventAt(0).cause as Error).cause as Error).message).toBe(
      'shared root',
    );
  });

  it('independent sibling roots emit separate groups in one flush', async () => {
    await Try.scope(async () => {
      await new Try(async (): Promise<never> => {
        throw new Error('a');
      })
        .report('A')
        .value();
      await new Try(async (): Promise<never> => {
        throw new Error('b');
      })
        .report('B')
        .value();
      return 'done';
    });

    expect(captureException).toHaveBeenCalledTimes(2);
    expect(eventAt(0).message).toBe('A');
    expect(eventAt(1).message).toBe('B');
  });

  it('aggregates parallel siblings (Promise.all) sharing one root', async () => {
    const shared = new Error('shared root');

    const out = await Try.scope(async () => {
      await Promise.all([
        new Try(async (): Promise<never> => {
          throw shared;
        })
          .report('A')
          .value(),
        new Try(async (): Promise<never> => {
          throw shared;
        })
          .report('B')
          .value(),
      ]);
      return 'all done';
    });

    expect(out).toBe('all done');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('supports a sync fn: aggregates siblings and returns the value', () => {
    const shared = new Error('shared root');

    const out = Try.scope(() => {
      new Try((): never => {
        throw shared;
      })
        .report('A')
        .value();
      new Try((): never => {
        throw shared;
      })
        .report('B')
        .value();
      return 'sync done';
    });

    expect(out).toBe('sync done');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('flushes collected siblings then rethrows when a sync fn throws', () => {
    const shared = new Error('shared root');

    expect(() =>
      Try.scope((): never => {
        new Try((): never => {
          throw shared;
        })
          .report('collected before throw')
          .value();
        throw new Error('own failure');
      }),
    ).toThrow('own failure');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(eventAt(0).message).toBe('collected before throw');
  });

  it('flushes collected siblings then propagates when an async fn rejects', async () => {
    await expect(
      Try.scope(async (): Promise<never> => {
        await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('collected before reject')
          .value();
        throw new Error('own rejection');
      }),
    ).rejects.toThrow('own rejection');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(eventAt(0).message).toBe('collected before reject');
  });

  it('a nested Try.scope opens its own boundary and flushes independently', async () => {
    await Try.scope(async () => {
      await Try.scope(async () => {
        await new Try(async (): Promise<never> => {
          throw new Error('inner');
        })
          .report('inner failed')
          .value();
        return 'inner done';
      });
      // Inner boundary flushed on its own settle, before the outer one.
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('inner failed');

      await new Try(async (): Promise<never> => {
        throw new Error('outer');
      })
        .report('outer failed')
        .value();
      return 'outer done';
    });

    expect(captureException).toHaveBeenCalledTimes(2);
    expect(eventAt(1).message).toBe('outer failed');
  });

  it('a Try inside Try.scope collects instead of opening its own boundary', async () => {
    await Try.scope(async () => {
      // Even a lone Try (which would otherwise be its own boundary) defers its
      // flush to the Try.scope boundary.
      await new Try(async (): Promise<never> => {
        throw new Error('boom');
      })
        .report('failed')
        .value();
      expect(captureException).not.toHaveBeenCalled();
      return 'done';
    });

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('on the legacy provider it just runs fn (no aggregation, no throw)', async () => {
    Try.setScopeProvider(new NoopScopeProvider());

    const out = await Try.scope(async () => {
      await new Try(async (): Promise<never> => {
        throw new Error('boom');
      })
        .report('failed')
        .value();
      return 'legacy done';
    });

    expect(out).toBe('legacy done');
    // Legacy path reports live, per terminal — Try.scope adds nothing.
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('a throwing reporter cannot escape the Try.scope flush', async () => {
    const hostileReporter = {
      report: (): never => {
        throw new Error('reporter down');
      },
      addBreadcrumbs: (): void => {},
      createWrappedError: (error: Error, message: string): Error => {
        const wrapped = new Error(message);
        wrapped.cause = error;
        return wrapped;
      },
      capture: (): never => {
        throw new Error('reporter down');
      },
    };
    Try.setDefaultReporter(hostileReporter);

    const out = await Try.scope(async () => {
      await new Try(async (): Promise<never> => {
        throw new Error('boom');
      })
        .report('failed')
        .value();
      return 'survived';
    });

    expect(out).toBe('survived');
  });
});
