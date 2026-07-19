/**
 * Regression tests derived from multi-CLI peer review of PR #36.
 * Each suite pins a specific finding; these tests MUST fail against the
 * current implementation and pass after the corresponding fix lands.
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

    it('async: await on Try instance does NOT captureException for throw-through error', async () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = async () => {
        throw new GraphQLError('validation error');
      };

      await new Try(fn).report('failed').default('fallback');

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('sync: .value() does NOT captureException for throw-through error', () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const fn = () => {
        throw new GraphQLError('validation error');
      };

      const result = new Try(fn)
        .report('failed')
        .default('fallback')
        .value();

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

      const parent = new Try(fn).finally(parentFinally);
      const child = parent.default('fallback').finally(childFinally);

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
});
