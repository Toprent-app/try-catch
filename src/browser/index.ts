export { Try, Try as default } from '../core/Try.js';
export type { TryResult, PublicTry } from '../core/Try.js';
import { Try as TryClass } from '../core/Try.js';
import { browserReporter } from '../adapters/browser/reporter.js';

// Set up the Browser reporter as the default for browser environments
TryClass.setDefaultReporter(browserReporter);

/**
 * Browser-specific Try class with Sentry integration pre-configured.
 * This uses the core Try class and automatically sets up Browser Sentry reporting.
 *
 * Usage:
 *   import { Try } from '@power-rent/try-catch/browser';
 *
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
