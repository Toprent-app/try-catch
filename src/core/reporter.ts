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
 * Core interface for error reporting
 * Implementations can integrate with different error tracking services (Sentry, Bugsnag, etc.)
 */
export interface Reporter {
  /**
   * Report an error with the given configuration
   * @param error The error to report
   * @param config Configuration for the error report
   */
  report(error: Error, config: ErrorReportConfig): void;

  /**
   * Add breadcrumbs to the reporting context
   * @param data The breadcrumb data to add
   * @param functionName Optional function name for context
   */
  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void;

  /**
   * Create a wrapped error with a custom message
   * @param error The original error
   * @param message The custom message to wrap with
   * @returns A new error with the custom message
   */
  createWrappedError(error: Error, message: string): Error;
}

/**
 * No-op implementation of the Reporter interface
 * Used as a default when no reporter is configured
 */
export class NoopReporter implements Reporter {
  report(_error: Error, _config: ErrorReportConfig): void {
    // Do nothing
  }

  addBreadcrumbs(_data: Record<string, unknown>, _functionName?: string): void {
    // Do nothing
  }

  createWrappedError(error: Error, message: string): Error {
    const wrappedError = new Error(message);
    wrappedError.cause = error;
    wrappedError.stack = error.stack;
    return wrappedError;
  }
}