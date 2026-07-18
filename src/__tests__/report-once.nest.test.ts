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

const captureException = Sentry.captureException as unknown as Mock;

type ChainedError = Error & { cause?: unknown };

function eventAt(call: number): ChainedError {
  return captureException.mock.calls[call][0] as ChainedError;
}

describe('report-once nesting & assembly (/node)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    Try.throwThroughErrorTypes([]);
  });

  it('one root through three layers → one event with the full cause chain', async () => {
    async function level3(): Promise<never> {
      throw new Error('boom');
    }
    async function level2(): Promise<never> {
      return new Try(level3).report('m3').unwrap();
    }
    async function level1(): Promise<never> {
      return new Try(level2).report('m2').unwrap();
    }

    await new Try(level1).report('m1').value();

    expect(captureException).toHaveBeenCalledTimes(1);
    const head = eventAt(0);
    expect(head.message).toBe('m1');
    expect((head.cause as ChainedError).message).toBe('m2');
    expect(((head.cause as ChainedError).cause as ChainedError).message).toBe(
      'm3',
    );
    expect(
      (((head.cause as ChainedError).cause as ChainedError).cause as Error)
        .message,
    ).toBe('boom');
  });

  it('preserves a pre-existing application cause chain on the leaf', async () => {
    const dbErr = new Error('db down');
    class DomainError extends Error {
      constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DomainError';
      }
    }

    async function level2(): Promise<never> {
      throw new DomainError('domain failed', { cause: dbErr });
    }
    async function level1(): Promise<never> {
      return new Try(level2).report('m2').unwrap();
    }

    await new Try(level1).report('m1').value();

    expect(captureException).toHaveBeenCalledTimes(1);
    const head = eventAt(0);
    // m1 → m2 → DomainError(→ dbErr). Leaf is the DomainError, not dbErr.
    const leaf = (head.cause as ChainedError).cause as ChainedError;
    expect(leaf.name).toBe('DomainError');
    expect(leaf.message).toBe('domain failed');
    expect(leaf.cause).toBe(dbErr);
  });

  it('two independent roots under one boundary → two events', async () => {
    async function boundaryFn(): Promise<string> {
      await new Try(async (): Promise<never> => {
        throw new Error('root-A');
      })
        .report('A failed')
        .value();
      await new Try(async (): Promise<never> => {
        throw new Error('root-B');
      })
        .report('B failed')
        .value();
      return 'done';
    }

    const out = await new Try(boundaryFn).value();

    expect(out).toBe('done');
    expect(captureException).toHaveBeenCalledTimes(2);
    const messages = [eventAt(0).message, eventAt(1).message].sort();
    expect(messages).toEqual(['A failed', 'B failed']);
  });

  it('mixes a recovered layer and a bubbled layer under one boundary', async () => {
    async function boundaryFn(): Promise<string> {
      await new Try(async (): Promise<never> => {
        throw new Error('root-A');
      })
        .report('A failed')
        .default(null)
        .value();

      try {
        await new Try(async (): Promise<never> => {
          throw new Error('root-B');
        })
          .report('B failed')
          .unwrap();
      } catch {
        // swallow — the report already happened via the collector
      }

      return 'done';
    }

    const out = await new Try(boundaryFn).value();

    expect(out).toBe('done');
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it('a boundary that itself reports merges into the nested root', async () => {
    async function inner(): Promise<never> {
      throw new Error('boom');
    }
    async function boundaryFn(): Promise<never> {
      return new Try(inner).report('inner').unwrap();
    }

    await new Try(boundaryFn).report('outer').value();

    // boundary error wraps the inner error → same root → single event.
    expect(captureException).toHaveBeenCalledTimes(1);
    const head = eventAt(0);
    expect(head.message).toBe('outer');
    expect((head.cause as ChainedError).message).toBe('inner');
    expect(((head.cause as ChainedError).cause as Error).message).toBe('boom');
  });

  it('survives a cyclic cause chain without looping', async () => {
    const a: ChainedError = new Error('a');
    const b: ChainedError = new Error('b');
    a.cause = b;
    b.cause = a;

    await new Try(async (): Promise<never> => {
      throw a;
    })
      .report('failed')
      .value();

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
