import * as Sentry from '@sentry/browser';
import type { Reporter, ErrorReportConfig } from '../../core/reporter';

/**
 * Browser Sentry reporter implementation
 * Uses @sentry/browser for client-side error reporting
 */
export class BrowserReporter implements Reporter {
  report(error: Error, config: ErrorReportConfig): void {
    const errorToReport = config.message 
      ? this.createWrappedError(error, config.message) 
      : error;
    
    Sentry.captureException(errorToReport, {
      tags: { ...config.tags, library: '@power-rent/try-catch' }
    });
  }

  addBreadcrumbs(data: Record<string, unknown>, functionName = 'anonymous'): void {
    Sentry.addBreadcrumb({ 
      message: `Calling ${functionName} function`, 
      data 
    });
  }

  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.stack = error.stack;
    return wrapped;
  }
}