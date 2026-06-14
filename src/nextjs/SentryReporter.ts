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
    // Breadcrumbs are added by the Try core (via addBreadcrumbs) before this
    // method is called, so we must NOT re-add them here or they would be
    // duplicated in Sentry. This keeps behaviour consistent with the
    // node/browser adapters, which also leave breadcrumb handling to the core.

    // Create wrapped error if custom message is provided
    const errorToReport = config.message
      ? this.createWrappedError(error, config.message)
      : error;

    // Report to Sentry with tags
    Sentry.captureException(errorToReport, {
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
