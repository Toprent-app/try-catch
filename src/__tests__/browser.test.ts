import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';

vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/browser';
import Try from '../browser';
import { BrowserReporter } from '../adapters/browser/reporter';

const captureException = Sentry.captureException as unknown as Mock;
const addBreadcrumb = Sentry.addBreadcrumb as unknown as Mock;

describe('/browser entry (legacy path — no collector)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports a wrapped error at the terminal via report()+value()', async () => {
    const out = await new Try(async (): Promise<never> => {
      throw new Error('boom');
    })
      .report('failed')
      .value();

    expect(out).toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = captureException.mock.calls[0];
    expect((error as Error).message).toBe('failed');
    expect((hint as { tags: Record<string, string> }).tags.library).toBe(
      '@power-rent/try-catch',
    );
  });

  it('error()+report() does NOT report on the legacy path', async () => {
    await new Try(async (): Promise<never> => {
      throw new Error('boom');
    })
      .report('failed')
      .error();

    expect(captureException).not.toHaveBeenCalled();
  });

  it('adds live breadcrumbs at the terminal', async () => {
    await new Try(
      async (_params: Record<string, unknown>): Promise<never> => {
        throw new Error('boom');
      },
      { id: 1 },
    )
      .breadcrumbs(['id'])
      .value();

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 1 } }),
    );
  });
});

describe('BrowserReporter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('report() captures the wrapped error with tags', () => {
    new BrowserReporter().report(new Error('boom'), {
      message: 'failed',
      tags: { a: 'b' },
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error] = captureException.mock.calls[0];
    expect((error as Error).message).toBe('failed');
  });

  it('report() captures the raw error when no message', () => {
    const raw = new Error('boom');
    new BrowserReporter().report(raw, { tags: {} });

    expect(captureException).toHaveBeenCalledWith(raw, {
      tags: { library: '@power-rent/try-catch' },
    });
  });

  it('addBreadcrumbs() forwards with the function name and defaults it', () => {
    const reporter = new BrowserReporter();
    reporter.addBreadcrumbs({ id: 1 }, 'fn');
    reporter.addBreadcrumbs({ id: 2 });

    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'Calling fn function' }),
    );
    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ message: 'Calling anonymous function' }),
    );
  });

  it('createWrappedError() preserves cause and stack', () => {
    const root = new Error('root');
    root.stack = 'ROOT';
    const wrapped = new BrowserReporter().createWrappedError(root, 'msg');

    expect(wrapped.message).toBe('msg');
    expect(wrapped.cause).toBe(root);
    expect(wrapped.stack).toBe('ROOT');
  });
});
