export { Try, Try as default } from '../core/Try.js';
export type { TryResult, PublicTry } from '../core/Try.js';
import { Try as TryClass } from '../core/Try.js';
import { nodeReporter } from '../adapters/node/reporter.js';

// Set up the Node reporter as the default for Node.js environments
TryClass.setDefaultReporter(nodeReporter);

/**
 * Node.js-specific Try class with Sentry integration pre-configured.
 * This uses the core Try class and automatically sets up Node.js Sentry reporting.
 *
 * Usage:
 *   import { Try } from '@power-rent/try-catch/node';
 *
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
