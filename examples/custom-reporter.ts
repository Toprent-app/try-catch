/**
 * Custom Reporter Example
 *
 * Demonstrates the current three-method `Reporter` interface from
 * `@power-rent/try-catch`:
 *   - `report(error, config)`   — send the error to your tracking service
 *   - `addBreadcrumbs(data, fn)` — attach breadcrumb context
 *   - `createWrappedError(error, message)` — build the wrapped error thrown by `.unwrap()`
 *
 * Every adapter shipped with this library (`src/adapters/node`, `src/adapters/browser`,
 * `src/nextjs/SentryReporter`) implements exactly this contract. A custom reporter
 * for any other backend (Datadog, Honeycomb, console, in-memory test collector, …)
 * follows the same shape.
 */
import type { Reporter, ErrorReportConfig } from '@power-rent/try-catch';

// === ConsoleReporter: a minimal Reporter that writes to stdout/stderr ===

class ConsoleReporter implements Reporter {
  report(error: Error, config: ErrorReportConfig): void {
    console.error('[report]', {
      message: config.message ?? error.message,
      name: error.name,
      tags: config.tags,
      stack: error.stack,
    });
  }

  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void {
    console.log('[breadcrumbs]', {
      functionName: functionName ?? 'anonymous',
      data,
    });
  }

  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.stack = error.stack;
    return wrapped;
  }
}

// === Registering a reporter ===
// `NoopReporter` is the library default — it never sends anything, so tests and
// examples run with no side effects. One call swaps in a different reporter for
// every `Try` instance in the process.
//
// This module registers nothing on import: the reporter is global, so an
// application importing `ConsoleReporter` for its own use must not have its
// reporting silently redirected as a side effect. Make the call yourself, where
// you want console reporting to take over:
//
//   import { Try } from '@power-rent/try-catch';
//   import { ConsoleReporter } from './custom-reporter';
//
//   Try.setDefaultReporter(new ConsoleReporter());

export { ConsoleReporter };
