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
import { BreadcrumbExtractorUtil } from '../utils';
import { extractDoctests } from './docs/doctest-extract';

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
      expect(() =>
        reporter.report(new Error('x'), { tags: {} }),
      ).not.toThrow();
      expect(() =>
        reporter.addBreadcrumbs({ a: 1 }, 'fn'),
      ).not.toThrow();
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

    it('browser entry registers BrowserReporter as default', async () => {
      await import('../browser');
      const { BrowserReporter } = await import(
        '../adapters/browser/reporter'
      );
      expect(Try.getDefaultReporter()).toBeInstanceOf(BrowserReporter);
    });

    it('node entry registers NodeReporter as default', async () => {
      await import('../node');
      const { NodeReporter } = await import('../adapters/node/reporter');
      expect(Try.getDefaultReporter()).toBeInstanceOf(NodeReporter);
    });
  });

  describe('Try.result() sync failure with breadcrumbs', () => {
    it('emits breadcrumbs on sync failure through result()', () => {
      const addBreadcrumbs = vi.fn();
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs,
        createWrappedError: (e) => e,
      });

      function syncBoom(user: { id: string; name: string }) {
        void user;
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
        [
          (v: unknown) => ({ a: v }),
          (v: unknown) => ({ b: v }),
        ],
        [1],
        false,
      );
      expect(out).toEqual({ a: 1 });
    });
  });

  describe('Try thenable branch', () => {
    it('then(null, reject) covers null onfulfilled branch', async () => {
      async function asyncOk() {
        return 7;
      }
      const t = new Try(asyncOk);
      const value = await (t as unknown as PromiseLike<number>).then(
        null,
        () => -1,
      );
      expect(value).toBe(7);
    });
  });

  describe('extractDoctests untagged unterminated fence', () => {
    it('breaks scanning on untagged unterminated fence without throw', () => {
      const source = 'intro\n```js\nconst x = 1;\n';
      expect(extractDoctests(source)).toHaveLength(0);
    });
  });
});
