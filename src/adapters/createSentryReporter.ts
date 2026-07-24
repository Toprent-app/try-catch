import type { Reporter, ErrorReportConfig } from '../core/reporter';

/**
 * Minimal subset of the Sentry SDK surface the reporters depend on. Kept loose
 * so the `@sentry/node`, `@sentry/browser`, and `@sentry/nextjs` namespaces all
 * satisfy it structurally without coupling to a specific Sentry version.
 */
export interface SentryLike {
  captureException(error: unknown, hint?: unknown): unknown;
  addBreadcrumb(breadcrumb: unknown): unknown;
}

/**
 * Build a {@link Reporter} backed by a Sentry SDK instance.
 *
 * The node, browser, and nextjs adapters differ only in which `@sentry/*`
 * package they import, so they all delegate here. Breadcrumbs are added by the
 * `Try` core (via `addBreadcrumbs`) before `report()` runs, so `report()`
 * deliberately does not add them — doing so would duplicate every breadcrumb.
 */
export function createSentryReporter(Sentry: SentryLike): Reporter {
  const createWrappedError = (error: Error, message: string): Error => {
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.stack = error.stack;
    return wrapped;
  };

  return {
    report(error: Error, config: ErrorReportConfig): void {
      const errorToReport = config.message
        ? createWrappedError(error, config.message)
        : error;

      Sentry.captureException(errorToReport, {
        tags: { ...config.tags, library: '@power-rent/try-catch' },
      });
    },

    addBreadcrumbs(
      data: Record<string, unknown>,
      functionName = 'anonymous',
    ): void {
      Sentry.addBreadcrumb({
        message: `Calling ${functionName} function`,
        data,
      });
    },

    createWrappedError,
  };
}
