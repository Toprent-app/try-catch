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

  describe('non-Error and error-like throws', () => {
    it('emits independent error-like failures separately (identity grouping)', async () => {
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

      // Distinct objects → distinct roots → two events (no false content merge).
      expect(captureException).toHaveBeenCalledTimes(2);
    });

    it('does not crash and still reports when throwing null (value)', async () => {
      const out = await new Try(async (): Promise<never> => {
        throw null;
      })
        .report('null failed')
        .value();

      expect(out).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(1);
      const head = captureException.mock.calls[0][0] as Error;
      expect(head.message).toBe('null failed');
      expect(head.cause).toBeNull();
    });

    it('does not crash when throwing undefined (value)', async () => {
      const out = await new Try(async (): Promise<never> => {
        throw undefined;
      })
        .report('undef failed')
        .value();

      expect(out).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('error() returns the raw null throw and still reports once', async () => {
      const error = await new Try(async (): Promise<never> => {
        throw null;
      })
        .report('null failed')
        .error();

      expect(error).toBeNull();
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('reports a primitive throw as the cause', async () => {
      await new Try(async (): Promise<never> => {
        throw 'oops';
      })
        .report('string failed')
        .value();

      expect(captureException).toHaveBeenCalledTimes(1);
      const head = captureException.mock.calls[0][0] as Error;
      expect(head.cause).toBe('oops');
    });

    it('throw null + report().unwrap() throws the wrapped error, not a TypeError', async () => {
      const thrown = await new Try(async (): Promise<never> => {
        throw null;
      })
        .report('msg')
        .unwrap()
        .catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('msg');
      expect((thrown as Error).cause).toBeNull();
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('throw undefined + report().unwrap() throws the wrapped error', async () => {
      const thrown = await new Try(async (): Promise<never> => {
        throw undefined;
      })
        .report('msg')
        .unwrap()
        .catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('msg');
      expect((thrown as Error).cause).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('throw string + report().unwrap() throws the wrapped error', async () => {
      const thrown = await new Try(async (): Promise<never> => {
        throw 'str';
      })
        .report('msg')
        .unwrap()
        .catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('msg');
      expect((thrown as Error).cause).toBe('str');
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('emits independent failures throwing the SAME primitive separately', async () => {
      // Two distinct logical failures that happen to throw an equal primitive
      // value. Primitives carry no identity, so they must NOT merge into one
      // event the way a shared Error instance would — each is its own root.
      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw 'boom';
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw 'boom';
        })
          .report('B')
          .value();
        return 'done';
      }

      await new Try(boundaryFn).value();

      expect(captureException).toHaveBeenCalledTimes(2);
    });
  });

  describe('hostile error property getters', () => {
    function withThrowingGetter(prop: 'stack' | 'cause'): Error {
      const err = new Error('boom');
      Object.defineProperty(err, prop, {
        get(): never {
          throw new Error(`hostile ${prop}`);
        },
      });
      return err;
    }

    it('a throwing stack getter cannot break value() and still emits', async () => {
      const hostile = withThrowingGetter('stack');

      const out = await new Try(async (): Promise<never> => {
        throw hostile;
      })
        .report('failed')
        .value();

      expect(out).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('failed');
      expect(eventAt(0).cause).toBe(hostile);
    });

    it('a throwing cause getter cannot break value() and still emits', async () => {
      const hostile = withThrowingGetter('cause');

      const out = await new Try(async (): Promise<never> => {
        throw hostile;
      })
        .report('failed')
        .value();

      expect(out).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('failed');
    });

    it('a hostile entry cannot block sibling groups or poison the scope buffer', async () => {
      const hostile = withThrowingGetter('cause');

      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw hostile;
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw new Error('sane');
        })
          .report('B')
          .value();
        return 'done';
      }

      const out = await new Try(boundaryFn).value();

      expect(out).toBe('done');
      // Both groups emitted despite the hostile root.
      expect(captureException).toHaveBeenCalledTimes(2);

      // The buffer was cleared: a later terminal works and emits exactly once.
      const later = await new Try(async (): Promise<never> => {
        throw new Error('later');
      })
        .report('later failed')
        .value();

      expect(later).toBeUndefined();
      expect(captureException).toHaveBeenCalledTimes(3);
      expect(eventAt(2).message).toBe('later failed');
    });
  });

  describe('flush-internal failures (defense in depth)', () => {
    // The natural triggers for these guards (hostile getters) are themselves
    // defended in rootOf/buildCauseChain, so the only way to exercise the
    // emitScope guards is to make the internals throw directly.
    type FlushInternals = {
      groupByRoot(entries: unknown[]): unknown[][];
      emitGroup(entries: unknown[]): void;
    };
    const proto = Try.prototype as unknown as FlushInternals;

    it('a throw from grouping cannot escape a terminal or dirty the buffer', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const groupSpy = vi
        .spyOn(proto, 'groupByRoot')
        .mockImplementation((): never => {
          throw new Error('grouping exploded');
        });

      try {
        const silent = await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .value();
        expect(silent).toBeUndefined();
        expect(errorSpy).not.toHaveBeenCalled(); // debug off → swallowed silently

        const logged = await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .debug(true)
          .value();
        expect(logged).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith(
          'Error in report-once flush',
          new Error('grouping exploded'),
        );
      } finally {
        groupSpy.mockRestore();
        errorSpy.mockRestore();
      }

      // The buffer was cleared despite the throw: a later terminal emits once.
      await new Try(async (): Promise<never> => {
        throw new Error('later');
      })
        .report('later failed')
        .value();
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(eventAt(0).message).toBe('later failed');
    });

    it('a throwing group is swallowed silently when debug is off', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const emitGroupSpy = vi.spyOn(proto, 'emitGroup');
      emitGroupSpy.mockImplementationOnce((): never => {
        throw new Error('group exploded');
      });

      try {
        const out = await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .value();

        expect(out).toBeUndefined();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(captureException).not.toHaveBeenCalled();
      } finally {
        emitGroupSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });

    it('one throwing group does not block the remaining groups', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const emitGroupSpy = vi.spyOn(proto, 'emitGroup');
      emitGroupSpy.mockImplementationOnce((): never => {
        throw new Error('first group exploded');
      });

      async function boundaryFn(): Promise<string> {
        await new Try(async (): Promise<never> => {
          throw new Error('one');
        })
          .report('A')
          .value();
        await new Try(async (): Promise<never> => {
          throw new Error('two');
        })
          .report('B')
          .value();
        return 'done';
      }

      try {
        const out = await new Try(boundaryFn).debug(true).value();

        expect(out).toBe('done');
        // First group threw and was swallowed; the second still emitted.
        expect(emitGroupSpy).toHaveBeenCalledTimes(2);
        expect(captureException).toHaveBeenCalledTimes(1);
        expect(eventAt(0).message).toBe('B');
        expect(errorSpy).toHaveBeenCalledWith(
          'Error in report-once flush',
          new Error('first group exploded'),
        );
      } finally {
        emitGroupSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  describe('work spawned after the boundary flushed', () => {
    it('a chain created in a callback firing post-flush aggregates as a fresh boundary', async () => {
      let settle!: () => void;
      const driven = new Promise<void>((resolve) => {
        settle = resolve;
      });

      async function inner(): Promise<never> {
        throw new Error('boom');
      }
      async function outer(): Promise<never> {
        return new Try(inner).report('inner failed').unwrap();
      }

      async function boundaryFn(): Promise<string> {
        setTimeout(() => {
          void (async (): Promise<void> => {
            await new Try(outer).report('outer failed').value();
            settle();
          })();
        }, 10);
        return 'scheduled';
      }

      const out = await new Try(boundaryFn).report('boundary').value();
      expect(out).toBe('scheduled');
      expect(captureException).not.toHaveBeenCalled();

      await driven;

      // One assembled event for the whole chain — not one lateEmit per layer.
      expect(captureException).toHaveBeenCalledTimes(1);
      const assembled = eventAt(0);
      expect(assembled.message).toBe('outer failed');
      expect((assembled.cause as Error).message).toBe('inner failed');
      expect(((assembled.cause as Error).cause as Error).message).toBe('boom');
    });
  });

  describe('async reporter capture()', () => {
    it('a rejecting async capture() cannot surface as an unhandledRejection', async () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        rejections.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      // Plain functions, not vi.fn(): vitest mocks track settled results by
      // attaching handlers to returned promises, which would mask the leak.
      let captureCalls = 0;
      const asyncReporter = {
        report: (): void => {},
        addBreadcrumbs: (): void => {},
        createWrappedError: (error: Error, message: string): Error => {
          const wrapped = new Error(message);
          wrapped.cause = error;
          return wrapped;
        },
        capture: async (): Promise<void> => {
          captureCalls++;
          throw new Error('async sink down');
        },
      };
      Try.setDefaultReporter(asyncReporter);

      try {
        const out = await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .value();

        expect(out).toBeUndefined();
        expect(captureCalls).toBe(1);

        // Give an orphaned rejection time to reach the process handler.
        await delay(20);
        expect(rejections).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
        Try.setDefaultReporter(new NodeReporter());
      }
    });

    it('logs a rejecting async capture() under debug', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const asyncReporter = {
        report: (): void => {},
        addBreadcrumbs: (): void => {},
        createWrappedError: (error: Error, message: string): Error => {
          const wrapped = new Error(message);
          wrapped.cause = error;
          return wrapped;
        },
        capture: async (): Promise<void> => {
          throw new Error('async sink down');
        },
      };
      Try.setDefaultReporter(asyncReporter);

      try {
        await new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .debug(true)
          .value();
        await delay(20);

        expect(errorSpy).toHaveBeenCalledWith(
          'Error in report-once flush',
          new Error('async sink down'),
        );
      } finally {
        errorSpy.mockRestore();
        Try.setDefaultReporter(new NodeReporter());
      }
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
