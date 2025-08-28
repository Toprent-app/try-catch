export { Try, Try as default, TryResult } from '../core/Try';
import { Try as TryClass } from '../core/Try';
import { NodeReporter } from '../adapters/node/reporter';

// Set up the Node reporter as the default for Node.js environments
TryClass.setDefaultReporter(new NodeReporter());

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