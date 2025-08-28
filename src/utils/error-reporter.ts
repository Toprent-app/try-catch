import * as Sentry from '@sentry/nextjs';

/**
 * Configuration for error reporting
 */
export interface ErrorReportConfig {
  readonly message?: string;
  readonly tags: Readonly<Record<string, string>>;
  readonly breadcrumbData?: Record<string, unknown>;
  readonly functionName?: string;
}

/**
 * @deprecated This class is deprecated and will be removed in a future version.
 * Use the Reporter interface from '../core/reporter' instead for better modularity.
 * 
 * Utility class for handling error reporting to Sentry
 */
export class ErrorReporter {
  /**
   * Report an error to Sentry with configured context
   */
  static report(error: Error, config: ErrorReportConfig): void {
    // Add breadcrumbs if configured
    if (config.breadcrumbData && Object.keys(config.breadcrumbData).length > 0) {
      this.addBreadcrumbs(config.breadcrumbData, config.functionName);
    }

    // Create wrapped error if custom message is provided
    const errorToReport = config.message ? this.createWrappedError(error, config.message) : error;

    // Report to Sentry with tags
    Sentry.captureException(errorToReport, {
      tags: { ...config.tags, library: '@power-rent/try-catch' },
    });
  }

  /**
   * Add breadcrumbs to Sentry context
   */
  static addBreadcrumbs(data: Record<string, unknown>, functionName = 'anonymous'): void {
    Sentry.addBreadcrumb({
      message: `Calling ${functionName} function`,
      data,
    });
  }

  /**
   * Create a wrapped error with custom message
   */
  static createWrappedError(error: Error, message: string): Error {
    const wrappedError = new Error(message);
    wrappedError.cause = error;
    wrappedError.stack = error.stack;
    return wrappedError;
  }

  /**
   * Check if an error type should be thrown through without wrapping
   */
  static shouldThrowThrough(error: Error, ignoreErrorTypes: readonly string[]): boolean {
    return ignoreErrorTypes.includes(error.name);
  }
}