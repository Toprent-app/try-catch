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
 * A single breadcrumb to attach to a collector-path event.
 */
export interface CaptureBreadcrumb {
  readonly data: Record<string, unknown>;
  readonly functionName?: string;
}

/**
 * Options for {@link Reporter.capture}: tags and breadcrumbs that must attach
 * to this one assembled event only (never to global reporter state).
 */
export interface CaptureOptions {
  readonly tags: Record<string, string>;
  readonly breadcrumbs?: ReadonlyArray<CaptureBreadcrumb>;
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

  /**
   * Optional collector-path emit. Receives a single pre-assembled error (the
   * full nested cause chain for one root failure) and attaches `opts.tags` /
   * `opts.breadcrumbs` to that event in isolation. Reporters that omit this
   * fall back to the legacy per-root {@link Reporter.report}.
   */
  capture?(assembledError: Error, opts: CaptureOptions): void;
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
    wrappedError.stack = (error as Error | null | undefined)?.stack;
    return wrappedError;
  }

  // Deliberately no `capture`: the collector path picks `capture` whenever it
  // exists, so a no-op here would make any subclass that overrides only
  // `report()` silently drop every report-once event. Absence routes the
  // collector flush to the `report()` fallback instead.
}
