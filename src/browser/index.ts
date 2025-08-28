export { Try, Try as default, TryResult } from '../core/Try';
import { Try as TryClass } from '../core/Try';
import { BrowserReporter } from '../adapters/browser/reporter';

// Set up the Browser reporter as the default for browser environments
TryClass.setDefaultReporter(new BrowserReporter());

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