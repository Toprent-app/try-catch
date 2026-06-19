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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function eventAt(call: number): Error {
  return captureException.mock.calls[call][0] as Error;
}

describe('report-once robustness (/node)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    Try.throwThroughErrorTypes([]);
  });

  describe('error-like de-dup', () => {
    it('same-content error-like roots dedup to one event', async () => {
      const make = () => ({ name: 'GraphQLError', message: 'gql', code: 'E1' });
      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw make();
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw make();
        })
          .report('B')
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();

      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('different-content error-like roots stay separate', async () => {
      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw { name: 'E', message: 'a', code: '1' };
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw { name: 'E', message: 'b', code: '2' };
        })
          .report('B')
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();

      expect(captureException).toHaveBeenCalledTimes(2);
    });

    it('error-like roots missing fields dedup by empty content', async () => {
      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw {};
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw {};
        })
          .report('B')
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();

      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('late collection (fire-and-forget)', () => {
    it('a nested Try settling after flush emits separately, not lost', async () => {
      async function boundaryFn(): Promise<string> {
        void new Try(async (): Promise<never> => {
          await delay(15);
          throw new Error('late');
        })
          .report('late failed')
          .value();
        return 'done';
      }

      const out = await new Try(boundaryFn).value();

      expect(out).toBe('done');
      // Boundary flushed with nothing collected yet.
      expect(captureException).not.toHaveBeenCalled();

      await delay(40);
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('late failed');
    });

    it('warns under debug when emitting a late nested error', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      async function boundaryFn(): Promise<string> {
        void new Try(async (): Promise<never> => {
          await delay(15);
          throw new Error('late');
        })
          .report('late failed')
          .debug(true)
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();
      await delay(40);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('settled after the boundary flushed'),
      );
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('a late breadcrumb-only nested Try emits nothing', async () => {
      async function boundaryFn(): Promise<string> {
        void new Try(
          async (_params: Record<string, unknown>): Promise<never> => {
            await delay(15);
            throw new Error('late');
          },
          { id: 1 },
        )
          .breadcrumbs(['id'])
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();
      await delay(40);

      expect(captureException).not.toHaveBeenCalled();
    });

    it('a late nested Try that succeeds emits nothing', async () => {
      async function boundaryFn(): Promise<string> {
        void new Try(async (): Promise<string> => {
          await delay(15);
          return 'ok';
        })
          .report('never')
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();
      await delay(40);

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('sync boundary', () => {
    it('emits an async nested Try separately (after the sync flush)', async () => {
      function syncBoundary(): string {
        void new Try(async (): Promise<never> => {
          await delay(15);
          throw new Error('async-nested');
        })
          .report('nested failed')
          .value();
        return 'sync-done';
      }

      const out = new Try(syncBoundary).value();

      expect(out).toBe('sync-done');
      expect(captureException).not.toHaveBeenCalled();

      await delay(40);
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('nested failed');
    });
  });

  describe('multi-terminal', () => {
    it('a nested Try collects at most once across multiple terminals', async () => {
      async function boundaryFn(): Promise<string> {
        const nested = new Try(async (): Promise<never> => {
          throw new Error('boom');
        }).report('nested');
        await nested.value();
        await nested.error();
        return 'done';
      }

      await new Try(boundaryFn).value();

      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('throwThroughErrorTypes', () => {
    it('still reports once and rethrows the original through a nested boundary', async () => {
      class ValidationError extends Error {
        name = 'ValidationError';
      }
      Try.throwThroughErrorTypes(['ValidationError']);

      async function boundaryFn(): Promise<never> {
        return new Try(async (): Promise<never> => {
          throw new ValidationError('invalid');
        })
          .report('inner')
          .unwrap();
      }

      await expect(
        new Try(boundaryFn).report('outer').unwrap(),
      ).rejects.toThrow('invalid');

      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });
});
