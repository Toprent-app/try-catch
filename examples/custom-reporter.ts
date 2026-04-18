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
 *
 * References: D-11 (examples match current src/ API), D-12 (package-path imports).
 */
import {
  Try,
  NoopReporter,
  type Reporter,
  type ErrorReportConfig,
} from '@power-rent/try-catch';

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

  addBreadcrumbs(
    data: Record<string, unknown>,
    functionName?: string,
  ): void {
    console.log('[breadcrumbs]', { functionName: functionName ?? 'anonymous', data });
  }

  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(message);
    wrapped.cause = error;
    wrapped.stack = error.stack;
    return wrapped;
  }
}

// === Baseline: NoopReporter ===
// NoopReporter is the library default — it never sends anything, so tests and
// examples can run with no side effects. Swap it out for a real reporter in
// production code:
Try.setDefaultReporter(new NoopReporter());

// === Swap-in: register the custom reporter ===
// A single call replaces the default reporter for all subsequent Try instances.
Try.setDefaultReporter(new ConsoleReporter());

export { ConsoleReporter };
