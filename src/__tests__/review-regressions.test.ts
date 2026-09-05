/**
 * Regression tests derived from multi-CLI peer review of PR #36 and PR #50.
 * Each suite pins a specific finding.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import Try from '../nextjs';

vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

import * as Sentry from '@sentry/nextjs';

/** Runtime `finally` always exists; PublicTry omits it when TReturn is not Promise-like. */
function withFinally<T>(attempt: T, callback: () => void | Promise<void>): T {
  return (
    attempt as T & {
      finally(cb: () => void | Promise<void>): T;
    }
  ).finally(callback);
}

class GraphQLError extends Error {
  name = 'GraphQLError';
}

describe('Regression: multi-CLI review findings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    Try.throwThroughErrorTypes([]);
  });

  /**
   * Cursor (CRITICAL) + Codex (HIGH): throw-through must short-circuit
   * Sentry on `.value()` and on the thenable-await path, not only on
   * `.unwrap()`. Previous fix covered only unwrap().
   */
  describe('throw-through on .value() / await', () => {
    it('async: .value() does NOT captureException for throw-through error', async () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = async () => {
        throw new GraphQLError('validation error');
      };

      const result = await new Try(fn)
        .report('failed')
        .default('fallback')
        .value();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(result).toBe('fallback');
    });

    it('awaiting a Try instance yields the instance and leaves fn unexecuted, so nothing runs or reports until a terminal is called', async () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = vi.fn(async () => {
        throw new GraphQLError('validation error');
      });

      const instance = new Try(fn).report('failed').default('fallback');
      // Promise.resolve assimilates thenables; getting the instance back proves
      // the instance is not thenable, so `await instance` never executes fn.
      const awaited: unknown = await Promise.resolve(instance);

      expect(awaited).toBe(instance);
      expect(fn).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('sync: .value() does NOT captureException for throw-through error', () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = () => {
        throw new GraphQLError('validation error');
      };

      const result = new Try(fn).report('failed').default('fallback').value();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(result).toBe('fallback');
    });
  });

  /**
   * Codex (HIGH): `.default()` returns a fresh Try that shares `exec`
   * state. `.finally()` installed on parent and child should both fire.
   * Current impl wires only the first `runFinallyCallback` closure
   * against the shared `exec.promise`, and `exec.finallyRan` suppresses
   * the other.
   */
  describe('.default() finally isolation', () => {
    it('async: parent .finally and child .default().finally both run exactly once', async () => {
      const parentFinally = vi.fn();
      const childFinally = vi.fn();
      const fn = async () => 'ok';

      const parent = new Try(fn).finally(parentFinally);
      const child = parent.default('fallback').finally(childFinally);

      await parent.value();
      await child.value();

      expect(parentFinally).toHaveBeenCalledTimes(1);
      expect(childFinally).toHaveBeenCalledTimes(1);
    });

    it('sync: parent .finally and child .default().finally both run exactly once', () => {
      const parentFinally = vi.fn();
      const childFinally = vi.fn();
      const fn = () => 'ok';

      const parent = withFinally(new Try(fn), parentFinally);
      const child = withFinally(parent.default('fallback'), childFinally);

      parent.value();
      child.value();

      expect(parentFinally).toHaveBeenCalledTimes(1);
      expect(childFinally).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Gemini (HIGH) + Codex (MEDIUM): `.default()` does not share
   * `local.breadcrumbsAdded`. Parent + child with the same breadcrumb
   * config consuming the same failed execution emit breadcrumbs twice.
   */
  describe('.default() breadcrumb idempotence', () => {
    it('parent + child .default() emit breadcrumbs only once for shared failure', async () => {
      const fn = async (_ctx: { context: string }) => {
        throw new Error('boom');
      };

      const parent = new Try(fn, { context: 'test' }).breadcrumbs(['context']);
      const child = parent.default('fallback');

      await parent.value();
      await child.value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Gemini (HIGH): `fn.constructor.name === 'AsyncFunction'` breaks for
   * `Function.prototype.bind` output (constructor name = 'Function').
   * Bound async methods should still be thenable.
   */
  describe('bound async functions resolve via .value()', () => {
    it('new Try(asyncMethod.bind(instance)).value() executes and resolves', async () => {
      class C {
        async run() {
          return 42;
        }
      }
      const c = new C();

      const result = await new Try(c.run.bind(c)).value();

      expect(result).toBe(42);
    });

    it('Try(arrowReturningPromiseFromAsync) with type declared async resolves via .value()', async () => {
      const asyncFn = async () => 'ok';
      const bound = asyncFn.bind(null);

      const result = await new Try(bound).value();

      expect(result).toBe('ok');
    });
  });

  /**
   * `reportError` had no shared-exec dedup guard (unlike breadcrumbs), so a
   * single settled failure consumed by both a `.default()` parent and its
   * clone called `captureException` twice. Guard mirrors
   * `exec.breadcrumbsEmitted`: it is keyed by `.report()` message, so one
   * shared failure captures each distinct message at most once and clones
   * carrying divergent messages each report their own.
   */
  describe('.default() report idempotence', () => {
    it('async: parent + child .default() capture the shared failure only once', async () => {
      const fn = async () => {
        throw new Error('boom');
      };

      const parent = new Try(fn).report('failed');
      const child = parent.default('fallback');

      await parent.value();
      await child.value();

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('async: parent and child (via .default()) with divergent .report() messages each reach Sentry', async () => {
      const fn = async () => {
        throw new Error('boom');
      };

      const parent = new Try(fn).report('parent failed');
      const child = parent.default('fallback').report('child failed');

      // Parent runs first and records its message on the shared execution.
      await parent.value();
      await child.value();

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
      expect(Sentry.captureException).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ message: 'parent failed' }),
        expect.anything(),
      );
      expect(Sentry.captureException).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ message: 'child failed' }),
        expect.anything(),
      );
    });
  });

  /**
   * throwThroughErrorTypes matches -> error is re-surfaced unwrapped and
   * MUST NOT be reported. `value()`/`unwrap()` honored this; `result()` and
   * `error()` did not (they reported on any `.report()`). Both paths fixed.
   */
  describe('throw-through on .result() / .error()', () => {
    it('async: .result() does NOT captureException for throw-through error', async () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = async () => {
        throw new GraphQLError('validation error');
      };

      const result = await new Try(fn).report('failed').result();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('async: .error() does NOT captureException for throw-through error', async () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = async () => {
        throw new GraphQLError('validation error');
      };

      const error = await new Try(fn).report('failed').error();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(GraphQLError);
    });

    it('sync: .result() does NOT captureException for throw-through error', () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = () => {
        throw new GraphQLError('validation error');
      };

      const result = new Try(fn).report('failed').result();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('sync: .error() does NOT captureException for throw-through error', () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = () => {
        throw new GraphQLError('validation error');
      };

      const error = new Try(fn).report('failed').error();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(GraphQLError);
    });
  });
  /**
   * PR #50: `.report()` is the sole trigger for a Sentry report, and the
   * dedup guard must hold for repeated terminal calls on a single instance,
   * not only for `.default()` clones sharing one execution.
   */
  describe('report idempotence for repeated terminals on one instance', () => {
    it('async: calling .value() twice on one instance captures the shared failure once, so a re-read never inflates Sentry volume', async () => {
      const fn = vi.fn(async () => {
        throw new Error('boom');
      });
      const instance = new Try(fn).report('failed').default('fallback');

      await instance.value();
      await instance.value();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('sync: calling .value() twice on one instance captures the shared failure once, so a re-read never inflates Sentry volume', () => {
      const fn = vi.fn(() => {
        throw new Error('boom');
      });
      const instance = new Try(fn).report('failed').default('fallback');

      instance.value();
      instance.value();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('async: mixing .value(), .error() and .result() on one instance captures the shared failure once', async () => {
      const instance = new Try(async () => {
        throw new Error('boom');
      })
        .report('failed')
        .default('fallback');

      await instance.value();
      await instance.error();
      await instance.result();

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('sync: mixing .value(), .error() and .result() on one instance captures the shared failure once', () => {
      const instance = new Try(() => {
        throw new Error('boom');
      })
        .report('failed')
        .default('fallback');

      instance.value();
      instance.error();
      instance.result();

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * PR #50: a throw-through error skips the Sentry report but still records
   * the breadcrumbs configured via `.breadcrumbs()`, so the context leading up
   * to an expected domain error stays available for the next real report.
   */
  describe('throw-through records breadcrumbs while skipping the report', () => {
    const failing = async (_ctx: { context: string }): Promise<string> => {
      throw new GraphQLError('validation error');
    };
    const failingSync = (_ctx: { context: string }): string => {
      throw new GraphQLError('validation error');
    };

    beforeEach(() => {
      Try.throwThroughErrorTypes(['GraphQLError']);
    });

    const expectBreadcrumbOnly = () => {
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ data: { context: 'test' } }),
      );
    };

    it('async: .value() records breadcrumbs and sends no report', async () => {
      await new Try(failing, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .default('fallback')
        .value();

      expectBreadcrumbOnly();
    });

    it('async: .result() records breadcrumbs and sends no report', async () => {
      await new Try(failing, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .result();

      expectBreadcrumbOnly();
    });

    it('async: .error() records breadcrumbs and sends no report', async () => {
      await new Try(failing, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .error();

      expectBreadcrumbOnly();
    });

    it('async: .unwrap() records breadcrumbs and sends no report', async () => {
      await expect(
        new Try(failing, { context: 'test' })
          .report('failed')
          .breadcrumbs(['context'])
          .unwrap(),
      ).rejects.toBeInstanceOf(GraphQLError);

      expectBreadcrumbOnly();
    });

    it('sync: .value() records breadcrumbs and sends no report', () => {
      new Try(failingSync, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .default('fallback')
        .value();

      expectBreadcrumbOnly();
    });

    it('sync: .result() records breadcrumbs and sends no report', () => {
      new Try(failingSync, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .result();

      expectBreadcrumbOnly();
    });

    it('sync: .error() records breadcrumbs and sends no report', () => {
      new Try(failingSync, { context: 'test' })
        .report('failed')
        .breadcrumbs(['context'])
        .error();

      expectBreadcrumbOnly();
    });

    it('sync: .unwrap() records breadcrumbs and sends no report', () => {
      expect(() =>
        new Try(failingSync, { context: 'test' })
          .report('failed')
          .breadcrumbs(['context'])
          .unwrap(),
      ).toThrow(GraphQLError);

      expectBreadcrumbOnly();
    });
  });
  /**
   * PR #50 (blocker): `normalizeThrown` passes `instanceof Error` values
   * through untouched, so a caught error can carry a throwing `name` getter —
   * realistically a Proxy wrapper from an ORM, mock, or observability layer.
   * Every throw-through membership test reads that `name`, so an unguarded
   * read escapes the terminal and breaks the never-throw contract.
   */
  describe('hostile error.name never escapes a terminal', () => {
    class ThrowingName extends Error {
      get name(): string {
        throw new Error('trap-name');
      }
    }

    const proxied = (): Error =>
      new Proxy(new Error('inner'), {
        get(target, prop, receiver) {
          if (prop === 'name') {
            throw new Error('trap-proxy');
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });

    const hostile: ReadonlyArray<readonly [string, () => Error]> = [
      [
        'Error subclass with a throwing name getter',
        () => new ThrowingName('x'),
      ],
      ['Proxy-wrapped Error with a trapping name handler', proxied],
    ];

    beforeEach(() => {
      // A non-empty registry is the realistic configuration; an empty one is no
      // shield either, because `[].includes(x)` still evaluates its argument.
      Try.throwThroughErrorTypes(['GraphQLError']);
    });

    it('sync: .value() returns the configured default for every hostile error', () => {
      for (const [label, make] of hostile) {
        const result = new Try((): string => {
          throw make();
        })
          .report('failed')
          .default('fallback')
          .value();

        expect(result, label).toBe('fallback');
      }
    });

    it('async: .value() returns the configured default for every hostile error', async () => {
      for (const [label, make] of hostile) {
        const result = await new Try(async (): Promise<string> => {
          throw make();
        })
          .report('failed')
          .default('fallback')
          .value();

        expect(result, label).toBe('fallback');
      }
    });

    it('sync: .result() returns a failure result for every hostile error', () => {
      for (const [label, make] of hostile) {
        const result = new Try((): string => {
          throw make();
        })
          .report('failed')
          .result();

        expect(result.success, label).toBe(false);
      }
    });

    it('async: .result() returns a failure result for every hostile error', async () => {
      for (const [label, make] of hostile) {
        const result = await new Try(async (): Promise<string> => {
          throw make();
        })
          .report('failed')
          .result();

        expect(result.success, label).toBe(false);
      }
    });

    it('sync: .error() returns the hostile error as a value', () => {
      for (const [label, make] of hostile) {
        const error = new Try((): string => {
          throw make();
        })
          .report('failed')
          .error();

        expect(error, label).toBeInstanceOf(Error);
      }
    });

    it('async: .error() returns the hostile error as a value', async () => {
      for (const [label, make] of hostile) {
        const error = await new Try(async (): Promise<string> => {
          throw make();
        })
          .report('failed')
          .error();

        expect(error, label).toBeInstanceOf(Error);
      }
    });

    it('sync: .unwrap() throws the wrapped error carrying the .report() message', () => {
      for (const [label, make] of hostile) {
        let thrown: unknown;
        try {
          new Try((): string => {
            throw make();
          })
            .report('failed')
            .unwrap();
        } catch (error) {
          thrown = error;
        }

        expect((thrown as Error).message, label).toBe('failed');
      }
    });

    it('async: .unwrap() rejects with the wrapped error carrying the .report() message', async () => {
      for (const [label, make] of hostile) {
        let thrown: unknown;
        try {
          await new Try(async (): Promise<string> => {
            throw make();
          })
            .report('failed')
            .unwrap();
        } catch (error) {
          thrown = error;
        }

        expect((thrown as Error).message, label).toBe('failed');
      }
    });

    it('reports a hostile error under its empty resolved name, so a broken name getter costs context but never a lost report', () => {
      new Try((): string => {
        throw new ThrowingName('x');
      })
        .report('failed')
        .default('fallback')
        .value();

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('suppresses the report when the hostile name resolves to a registered throw-through type', () => {
      // '' is what a throwing name getter resolves to; registering it proves the
      // resolved value — not a swallowed exception — drives the decision.
      Try.throwThroughErrorTypes(['']);

      const result = new Try((): string => {
        throw new ThrowingName('x');
      })
        .report('failed')
        .default('fallback')
        .value();

      expect(result).toBe('fallback');
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});
