import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { SentryReporter } from '../../nextjs/SentryReporter';

describe('SentryReporter / nextjs (SENT-01, SENT-02, SENT-03, ENTRY-03)', () => {
  let reporter: SentryReporter;

  beforeEach(() => {
    reporter = new SentryReporter();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(Sentry.addBreadcrumb).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('report() without message captures original error with library tag', () => {
    const err = new Error('boom');
    reporter.report(err, { tags: {} });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { library: '@power-rent/try-catch' },
    });
  });

  it('report() with message wraps the error preserving cause + stack', () => {
    const original = new Error('boom');
    reporter.report(original, { message: 'wrapped', tags: { env: 'test' } });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [passedError, opts] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(passedError).toBeInstanceOf(Error);
    expect((passedError as Error).message).toBe('wrapped');
    expect((passedError as Error).cause).toBe(original);
    expect((passedError as Error).stack).toBe(original.stack);
    expect(opts).toEqual({ tags: { env: 'test', library: '@power-rent/try-catch' } });
  });

  it('addBreadcrumbs() with functionName emits Sentry.addBreadcrumb', () => {
    reporter.addBreadcrumbs({ userId: 123 }, 'fetchUser');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: 'Calling fetchUser function',
      data: { userId: 123 },
    });
  });

  it('addBreadcrumbs() without functionName uses "anonymous"', () => {
    reporter.addBreadcrumbs({ foo: 'bar' });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: 'Calling anonymous function',
      data: { foo: 'bar' },
    });
  });

  it('createWrappedError sets message, cause, and stack', () => {
    const original = new Error('original');
    const wrapped = reporter.createWrappedError(original, 'wrapper');
    expect(wrapped.message).toBe('wrapper');
    expect(wrapped.cause).toBe(original);
    expect(wrapped.stack).toBe(original.stack);
  });

  it('report() does NOT internally call Sentry.addBreadcrumb (D-07)', () => {
    const original = new Error('boom');
    reporter.report(original, {
      message: 'wrapped',
      tags: { env: 'test' },
    });
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
