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

import * as SentryBrowser from '@sentry/browser';
import * as SentryNode from '@sentry/node';
import * as SentryNextjs from '@sentry/nextjs';
import { browserReporter } from '../../adapters/browser/reporter';
import { nodeReporter } from '../../adapters/node/reporter';
import { sentryReporter } from '../../nextjs/SentryReporter';
import type { Reporter } from '../../core/reporter';
import type { Mock } from 'vitest';

/**
 * The three entry points wrap different Sentry SDKs but owe the caller one
 * contract, so they are held to the same assertions here. A behaviour that
 * holds for only one SDK is a bug in that adapter, not a variant. The SDK
 * namespaces have incompatible signatures, so each row carries the two
 * doubles the assertions touch rather than the namespace itself.
 */
const adapters: readonly {
  name: string;
  reporter: Reporter;
  captureException: Mock;
  addBreadcrumb: Mock;
}[] = [
  {
    name: 'BrowserReporter',
    reporter: browserReporter,
    captureException: vi.mocked(SentryBrowser.captureException),
    addBreadcrumb: vi.mocked(SentryBrowser.addBreadcrumb),
  },
  {
    name: 'NodeReporter',
    reporter: nodeReporter,
    captureException: vi.mocked(SentryNode.captureException),
    addBreadcrumb: vi.mocked(SentryNode.addBreadcrumb),
  },
  {
    name: 'SentryReporter / nextjs',
    reporter: sentryReporter,
    captureException: vi.mocked(SentryNextjs.captureException),
    addBreadcrumb: vi.mocked(SentryNextjs.addBreadcrumb),
  },
];

describe.each(adapters)(
  '$name',
  ({ reporter, captureException, addBreadcrumb }) => {
    beforeEach(() => {
      captureException.mockClear();
      addBreadcrumb.mockClear();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('report() without message captures original error with library tag', () => {
      const err = new Error('boom');
      reporter.report(err, { tags: {} });
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(err, {
        tags: { library: '@power-rent/try-catch' },
      });
    });

    it('report() with message wraps the error preserving cause + stack', () => {
      const original = new Error('boom');
      reporter.report(original, { message: 'wrapped', tags: { env: 'test' } });
      expect(captureException).toHaveBeenCalledTimes(1);
      const [passedError, opts] = captureException.mock.calls[0];
      expect(passedError).toBeInstanceOf(Error);
      expect((passedError as Error).message).toBe('wrapped');
      expect((passedError as Error).cause).toBe(original);
      expect((passedError as Error).stack).toBe(original.stack);
      expect(opts).toEqual({
        tags: { env: 'test', library: '@power-rent/try-catch' },
      });
    });

    it('addBreadcrumbs() with functionName emits addBreadcrumb', () => {
      reporter.addBreadcrumbs({ userId: 123 }, 'fetchUser');
      expect(addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        message: 'Calling fetchUser function',
        data: { userId: 123 },
      });
    });

    it('addBreadcrumbs() without functionName uses "anonymous"', () => {
      reporter.addBreadcrumbs({ foo: 'bar' });
      expect(addBreadcrumb).toHaveBeenCalledWith({
        message: 'Calling anonymous function',
        data: { foo: 'bar' },
      });
    });

    it('report() does NOT internally call addBreadcrumb', () => {
      reporter.report(new Error('boom'), {
        message: 'wrapped',
        tags: { env: 'test' },
      });
      expect(addBreadcrumb).not.toHaveBeenCalled();
      expect(captureException).toHaveBeenCalledTimes(1);
    });
  },
);
