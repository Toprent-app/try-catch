import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
  type Mock,
} from 'vitest';

// installNextjsCollector only activates on the Node.js runtime. Set this before
// the entry is imported so the guarded dynamic import runs.
vi.hoisted(() => {
  process.env.NEXT_RUNTIME = 'nodejs';
});

const { scopeMock } = vi.hoisted(() => ({
  scopeMock: { setTags: vi.fn(), addBreadcrumb: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn((cb: (scope: typeof scopeMock) => void) => cb(scopeMock)),
}));

import * as Sentry from '@sentry/nextjs';
import Try from '../nextjs';
import { SentryReporter } from '../nextjs/SentryReporter';
import { getScopeProvider } from '../core/scope';

const captureException = Sentry.captureException as unknown as Mock;
const addBreadcrumb = Sentry.addBreadcrumb as unknown as Mock;

describe('report-once on /nextjs (Node runtime)', () => {
  beforeAll(async () => {
    // The collector is installed via a guarded dynamic import; wait for it.
    await vi.waitFor(() => {
      if (!getScopeProvider().collects) {
        throw new Error('collector not installed yet');
      }
    });
  });

  afterAll(() => {
    delete process.env.NEXT_RUNTIME;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('activates the AsyncLocalStorage collector', () => {
    expect(getScopeProvider().collects).toBe(true);
  });

  it('emits one assembled event through the collector + capture path', async () => {
    const out = await new Try(async (): Promise<never> => {
      throw new Error('boom');
    })
      .report('failed')
      .value();

    expect(out).toBeUndefined();
    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    const assembled = captureException.mock.calls[0][0] as Error;
    expect(assembled.message).toBe('failed');
    expect((assembled.cause as Error).message).toBe('boom');
  });

  it('error()+report() now emits on nextjs Node runtime', async () => {
    await new Try(async (): Promise<never> => {
      throw new Error('boom');
    })
      .report('failed')
      .error();

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe('SentryReporter (legacy methods)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('report() adds breadcrumbs then captures the wrapped error', () => {
    new SentryReporter().report(new Error('boom'), {
      message: 'failed',
      tags: { a: 'b' },
      breadcrumbData: { id: 1 },
      functionName: 'fn',
    });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling fn function',
        data: { id: 1 },
      }),
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = captureException.mock.calls[0];
    expect((error as Error).message).toBe('failed');
    expect((hint as { tags: Record<string, string> }).tags.library).toBe(
      '@power-rent/try-catch',
    );
  });

  it('report() captures the raw error and skips empty breadcrumbs', () => {
    const raw = new Error('boom');
    new SentryReporter().report(raw, { tags: {}, breadcrumbData: {} });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(raw, {
      tags: { library: '@power-rent/try-catch' },
    });
  });

  it('addBreadcrumbs() defaults the function name', () => {
    new SentryReporter().addBreadcrumbs({ id: 1 });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Calling anonymous function' }),
    );
  });

  it('createWrappedError() preserves cause and stack', () => {
    const root = new Error('root');
    root.stack = 'ROOT';
    const wrapped = new SentryReporter().createWrappedError(root, 'msg');

    expect(wrapped.message).toBe('msg');
    expect(wrapped.cause).toBe(root);
    expect(wrapped.stack).toBe('ROOT');
  });

  it('capture() attaches tags + breadcrumbs in an isolated scope', () => {
    new SentryReporter().capture(new Error('assembled'), {
      tags: { component: 'svc' },
      breadcrumbs: [{ data: { id: 1 } }],
    });

    expect(scopeMock.setTags).toHaveBeenCalledWith({
      component: 'svc',
      library: '@power-rent/try-catch',
    });
    expect(scopeMock.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling anonymous function',
        data: { id: 1 },
      }),
    );
    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
