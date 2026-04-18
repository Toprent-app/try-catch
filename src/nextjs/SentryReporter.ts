import * as Sentry from '@sentry/nextjs';
import { Reporter, ErrorReportConfig } from '../core/reporter';

/**
 * Sentry-specific implementation of the Reporter interface
 * Integrates with Sentry for error tracking and breadcrumb collection
 */
export class SentryReporter implements Reporter {
  /**
   * Report an error to Sentry with configured context
   */
  report(error: Error, config: ErrorReportConfig): void {
    const errorToReport = config.message
      ? this.createWrappedError(error, config.message)
      : error;

    Sentry.captureException(errorToReport, {
      // `library` is injected last so user-supplied `tags` cannot shadow our provenance signal
      tags: { ...config.tags, library: '@power-rent/try-catch' },
    });
  }

  /**
   * Add breadcrumbs to Sentry context
   */
  addBreadcrumbs(
    data: Record<string, unknown>,
    functionName = 'anonymous',
  ): void {
    Sentry.addBreadcrumb({
      message: `Calling ${functionName} function`,
      data,
    });
  }

  /**
   * Create a wrapped error with custom message
   */
  createWrappedError(error: Error, message: string): Error {
    const wrappedError = new Error(message);
    wrappedError.cause = error;
    wrappedError.stack = error.stack;
    return wrappedError;
  }
}
