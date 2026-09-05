import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { Try } from '../core/Try';
import { NoopReporter } from '../core/reporter';
import type { Reporter } from '../core/reporter';
import { BreadcrumbExtractorUtil } from '../utils';
import { normalizeThrown } from '../utils/normalize';

describe('coverage gaps', () => {
  describe('NoopReporter.createWrappedError', () => {
    it('wraps error preserving cause and stack', () => {
      const reporter = new NoopReporter();
      const original = new Error('original');
      original.stack = 'original-stack';
      const wrapped = reporter.createWrappedError(original, 'wrapped');

      expect(wrapped).toBeInstanceOf(Error);
      expect(wrapped.message).toBe('wrapped');
      expect(wrapped.cause).toBe(original);
      expect(wrapped.stack).toBe('original-stack');
    });

    it('report and addBreadcrumbs are no-ops', () => {
      const reporter = new NoopReporter();
      expect(() => reporter.report(new Error('x'), { tags: {} })).not.toThrow();
      expect(() => reporter.addBreadcrumbs({ a: 1 }, 'fn')).not.toThrow();
    });
  });

  describe('entry modules register default reporters', () => {
    let priorReporter: ReturnType<typeof Try.getDefaultReporter>;

    beforeEach(() => {
      priorReporter = Try.getDefaultReporter();
    });

    afterEach(() => {
      Try.setDefaultReporter(priorReporter);
    });

    it('browser entry registers the browser reporter as default', async () => {
      await import('../browser');
      const { browserReporter } = await import('../adapters/browser/reporter');
      expect(Try.getDefaultReporter()).toBe(browserReporter);
    });

    it('node entry registers the node reporter as default', async () => {
      await import('../node');
      const { nodeReporter } = await import('../adapters/node/reporter');
      expect(Try.getDefaultReporter()).toBe(nodeReporter);
    });
  });

  describe('Try.result() sync failure with breadcrumbs', () => {
    let priorReporter: ReturnType<typeof Try.getDefaultReporter>;

    beforeEach(() => {
      priorReporter = Try.getDefaultReporter();
    });

    afterEach(() => {
      Try.setDefaultReporter(priorReporter);
    });

    it('emits breadcrumbs on sync failure through result()', () => {
      const addBreadcrumbs = vi.fn();
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs,
        createWrappedError: (e) => e,
      });

      function syncBoom(_user: { id: string; name: string }) {
        throw new Error('sync boom');
      }

      const res = new Try(syncBoom, { id: 'u1', name: 'n' })
        .breadcrumbs([['id', 'name']])
        .result();

      // Sync path — result is not a Promise
      expect('success' in (res as object)).toBe(true);
      expect(addBreadcrumbs).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbs).toHaveBeenCalledWith(
        { id: 'u1', name: 'n' },
        'syncBoom',
      );
    });
  });

  describe('default() clone with async finally on cached async exec', () => {
    it('runs clone finally callback after parent resolves', async () => {
      async function op(x: number) {
        return x * 2;
      }

      const parent = new Try(op, 3);
      // prime parent execution
      await parent.result();

      const cloneFinally = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      );
      const cloneRes = await parent.default(0).finally(cloneFinally).result();

      expect(cloneRes.success).toBe(true);
      expect(cloneFinally).toHaveBeenCalledTimes(1);
    });
  });

  describe('BreadcrumbExtractorUtil.extract edge cases', () => {
    it('object-style array config with non-object param returns {}', () => {
      const out = BreadcrumbExtractorUtil.extract(
        { 0: ['id'] },
        ['not-an-object'],
        false,
      );
      expect(out).toEqual({});
    });

    it('positional tuple entry extracts keys from object arg', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [['id', 'name']],
        [{ id: 'a', name: 'b', extra: 1 }],
        false,
      );
      expect(out).toEqual({ id: 'a', name: 'b' });
    });

    it('positional tuple entry with non-object arg yields nothing', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [['id']],
        ['string-not-object'],
        false,
      );
      expect(out).toEqual({});
    });

    it('predefined transformer via "as" key', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [{ param: 0, as: 'length' }],
        [[1, 2, 3]],
        false,
      );
      expect(out).toEqual({ param0_length: 3 });
    });

    it('length transformer on non-string/array/object returns {}', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [{ param: 0, as: 'length' }],
        [42],
        false,
      );
      expect(out).toEqual({});
    });

    it('object-style function config applies transformer', () => {
      const out = BreadcrumbExtractorUtil.extract(
        { 0: (v: unknown) => ({ doubled: (v as number) * 2 }) },
        [5],
        false,
      );
      expect(out).toEqual({ doubled: 10 });
    });

    it('predefined transformer throws in debug logs via console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwy = {
        toString() {
          throw new Error('toString boom');
        },
      };
      const out = BreadcrumbExtractorUtil.extract(
        [{ param: 0, as: 'toString' }],
        [throwy],
        true,
      );
      expect(out).toEqual({});
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('object-style config with undefined paramConfig is skipped', () => {
      const out = BreadcrumbExtractorUtil.extract(
        { 0: undefined, 1: ['id'] } as never,
        ['x', { id: 1 }],
        false,
      );
      expect(out).toEqual({ id: 1 });
    });

    it('custom transformer throws in debug logs via console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const out = BreadcrumbExtractorUtil.extract(
        [
          {
            param: 0,
            transform: () => {
              throw new Error('transform boom');
            },
          },
        ],
        [1],
        true,
      );
      expect(out).toEqual({});
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('predefined transformer throws without debug silently', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwy = {
        toString() {
          throw new Error('silent boom');
        },
      };
      const out = BreadcrumbExtractorUtil.extract(
        [{ param: 0, as: 'toString' }],
        [throwy],
        false,
      );
      expect(out).toEqual({});
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('custom transformer throws without debug silently', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const out = BreadcrumbExtractorUtil.extract(
        [
          {
            param: 0,
            transform: () => {
              throw new Error('quiet');
            },
          },
        ],
        [1],
        false,
      );
      expect(out).toEqual({});
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('variadic transformer array with fewer args than transformers', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [(v: unknown) => ({ a: v }), (v: unknown) => ({ b: v })],
        [1],
        false,
      );
      expect(out).toEqual({ a: 1 });
    });

    it('non-object, non-array config returns empty object', () => {
      const out = BreadcrumbExtractorUtil.extract(
        42 as never,
        [{ id: 1 }],
        false,
      );
      expect(out).toEqual({});
    });

    it('extractor without keys/transform/as returns empty object', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [{ param: 0 } as never],
        [{ id: 1 }],
        false,
      );
      expect(out).toEqual({});
    });

    it('positional string entry with undefined arg is dropped', () => {
      const out = BreadcrumbExtractorUtil.extract(
        ['label'],
        [undefined] as never,
        false,
      );
      expect(out).toEqual({});
    });

    it('positional entry that is neither string nor array is skipped', () => {
      const out = BreadcrumbExtractorUtil.extract(
        [42 as never],
        [{ id: 1 }],
        false,
      );
      expect(out).toEqual({});
    });

    it('object-style config with non-array non-function paramConfig returns empty', () => {
      const out = BreadcrumbExtractorUtil.extract(
        { 0: 'unexpected' as never },
        [{ id: 1 }],
        false,
      );
      expect(out).toEqual({});
    });
  });

  describe('reporter error resilience', () => {
    let priorReporter: ReturnType<typeof Try.getDefaultReporter>;

    beforeEach(() => {
      priorReporter = Try.getDefaultReporter();
    });

    afterEach(() => {
      Try.setDefaultReporter(priorReporter);
    });

    it('sync: reporter.report() throwing does not mask original error', () => {
      Try.setDefaultReporter({
        report: () => {
          throw new Error('reporter down');
        },
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e, m) => {
          const w = new Error(m);
          w.cause = e;
          return w;
        },
      });

      expect(() =>
        new Try(() => {
          throw new Error('original');
        })
          .report('wrapped')
          .unwrap(),
      ).toThrow('wrapped');
    });

    it('async: reporter.report() throwing does not mask original error', async () => {
      Try.setDefaultReporter({
        report: () => {
          throw new Error('reporter down');
        },
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e, m) => {
          const w = new Error(m);
          w.cause = e;
          return w;
        },
      });

      await expect(
        new Try(async () => {
          throw new Error('original');
        })
          .report('wrapped')
          .unwrap(),
      ).rejects.toThrow('wrapped');
    });

    it('reporter.addBreadcrumbs() throwing does not break execution', async () => {
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs: () => {
          throw new Error('breadcrumb store unavailable');
        },
        createWrappedError: (e) => e,
      });

      const result = await new Try(
        async (_ctx: { id: string }) => {
          throw new Error('original');
        },
        { id: 'x' },
      )
        .breadcrumbs(['id'])
        .default('fallback')
        .value();

      expect(result).toBe('fallback');
    });

    it('sync: reporter.addBreadcrumbs() throwing does not break execution', () => {
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs: () => {
          throw new Error('breadcrumb store unavailable');
        },
        createWrappedError: (e) => e,
      });

      const err = new Try(
        (_ctx: { id: string }) => {
          throw new Error('original');
        },
        { id: 'x' },
      )
        .breadcrumbs(['id'])
        .error();

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('original');
    });

    it('reporter errors are logged in debug mode', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Try.setDefaultReporter({
        report: () => {
          throw new Error('reporter down');
        },
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e) => e,
      });

      await new Try(async () => {
        throw new Error('original');
      })
        .debug(true)
        .report('msg')
        .default('fallback')
        .value();

      expect(spy).toHaveBeenCalledWith('Error in reporter', expect.any(Error));
      spy.mockRestore();
    });

    it('reporter errors are silent without debug', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Try.setDefaultReporter({
        report: () => {
          throw new Error('reporter down');
        },
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e) => e,
      });

      await new Try(async () => {
        throw new Error('original');
      })
        .report('msg')
        .default('fallback')
        .value();

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('addBreadcrumbs errors are logged in debug mode', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs: () => {
          throw new Error('breadcrumb store down');
        },
        createWrappedError: (e) => e,
      });

      await new Try(
        async (_ctx: { id: string }) => {
          throw new Error('original');
        },
        { id: 'x' },
      )
        .debug(true)
        .breadcrumbs(['id'])
        .default('fallback')
        .value();

      expect(spy).toHaveBeenCalledWith('Error in reporter', expect.any(Error));
      spy.mockRestore();
    });
  });
  /**
   * PR #50: `ErrorReportConfig` is public API. A custom Reporter receives the
   * extracted breadcrumb data and the wrapped function's name alongside the
   * message and tags, so it can attach that context to its own event shape.
   */
  describe('ErrorReportConfig delivered to a custom reporter', () => {
    let priorReporter: Reporter;

    beforeEach(() => {
      priorReporter = Try.getDefaultReporter();
    });

    afterEach(() => {
      Try.setDefaultReporter(priorReporter);
    });

    it('async: hands the reporter the breadcrumb data and function name for the failing call', async () => {
      const report = vi.fn();
      Try.setDefaultReporter({
        report,
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e) => e,
      });

      async function fetchUser(_ctx: { id: string }): Promise<string> {
        throw new Error('boom');
      }

      await new Try(fetchUser, { id: 'u1' })
        .report('user lookup failed')
        .tag('component', 'users')
        .breadcrumbs(['id'])
        .default('fallback')
        .value();

      expect(report).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(expect.any(Error), {
        message: 'user lookup failed',
        tags: { component: 'users' },
        breadcrumbData: { id: 'u1' },
        functionName: 'fetchUser',
      });
    });

    it('sync: hands the reporter the function name even when no breadcrumbs are configured', () => {
      const report = vi.fn();
      Try.setDefaultReporter({
        report,
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e) => e,
      });

      function chargeCard(): string {
        throw new Error('boom');
      }

      new Try(chargeCard).report('charge failed').default('fallback').value();

      expect(report).toHaveBeenCalledWith(expect.any(Error), {
        message: 'charge failed',
        tags: {},
        breadcrumbData: undefined,
        functionName: 'chargeCard',
      });
    });
  });

  /**
   * PR #50: `Try.throwThroughErrorTypes` writes the same static slot every
   * membership test reads, so configuring the registry through a subclass
   * takes effect instead of silently populating a shadowing static.
   */
  describe('throw-through registry is shared with subclasses', () => {
    let priorReporter: Reporter;

    beforeEach(() => {
      priorReporter = Try.getDefaultReporter();
    });

    afterEach(() => {
      Try.setDefaultReporter(priorReporter);
      Try.throwThroughErrorTypes([]);
    });

    it('configuring the registry through a subclass suppresses reporting, so extending Try keeps the static configuration API working', () => {
      class MyTry extends Try<string, []> {}

      const report = vi.fn();
      Try.setDefaultReporter({
        report,
        addBreadcrumbs: vi.fn(),
        createWrappedError: (e) => e,
      });

      const throwValidation = (): string => {
        const error = new Error('invalid');
        error.name = 'ValidationError';
        throw error;
      };

      MyTry.throwThroughErrorTypes(['ValidationError']);

      new MyTry(throwValidation).report('m').value();
      expect(report).not.toHaveBeenCalled();

      // The base class reads the same registry the subclass wrote.
      new Try(throwValidation).report('m').value();
      expect(report).not.toHaveBeenCalled();
    });
  });

  /**
   * PR #50: `throw await res.json()` can carry own keys that shadow
   * `Object.prototype` members or the thenable protocol. Copying them onto the
   * reconstructed Error breaks language-level operations for the consumer.
   */
  describe('normalizeThrown skips keys that break the reconstructed Error', () => {
    it('drops a payload toString so String(error) stays usable instead of throwing on primitive conversion', () => {
      const payload = JSON.parse(
        '{"message":"api failed","toString":"pwned","code":"E_LIMIT"}',
      ) as unknown;

      const error = normalizeThrown(payload);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('api failed');
      expect(() => String(error)).not.toThrow();
      expect(String(error)).toBe('Error: api failed');
      expect(`${error}`).toBe('Error: api failed');
      // Custom fields still survive for the reporter.
      expect((error as Error & { code?: string }).code).toBe('E_LIMIT');
      expect(Object.hasOwn(error, 'toString')).toBe(false);
    });

    it('drops a payload valueOf so numeric coercion of the error stays usable', () => {
      const payload = JSON.parse(
        '{"message":"api failed","valueOf":"pwned"}',
      ) as unknown;

      const error = normalizeThrown(payload);

      expect(() => String(error)).not.toThrow();
      expect(Object.hasOwn(error, 'valueOf')).toBe(false);
    });

    it('drops a callable then so awaiting the error returned by .error() yields the error itself', async () => {
      const payload = {
        message: 'api failed',
        then: (resolve: (value: unknown) => void) => {
          resolve('hijacked');
        },
      };

      const error = await new Try(async (): Promise<string> => {
        // A non-Error payload carrying a callable `then` is the whole point.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw payload;
      }).error();

      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('api failed');
    });

    it('keeps the reconstructed value an Error when the payload shadows prototype internals', () => {
      const payload = JSON.parse(
        '{"message":"api failed","__proto__":{"x":1},"constructor":"c","prototype":"p","hasOwnProperty":true,"isPrototypeOf":true,"propertyIsEnumerable":true,"toLocaleString":"l"}',
      ) as unknown;

      const error = normalizeThrown(payload);

      expect(error).toBeInstanceOf(Error);
      expect(() => String(error)).not.toThrow();
      for (const key of [
        'constructor',
        'prototype',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
      ]) {
        expect(Object.hasOwn(error, key), key).toBe(false);
      }
    });
  });
});
