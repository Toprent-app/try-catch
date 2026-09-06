export { Try, Try as default } from '../core/Try.js';
export type { TryResult, PublicTry } from '../core/Try.js';
import { Try as TryClass } from '../core/Try.js';
import { sentryReporter } from './SentryReporter.js';

// Set up the Sentry reporter as the default for NextJS
TryClass.setDefaultReporter(sentryReporter);

/**
 * NextJS-specific Try entry with Sentry integration pre-configured.
 * Re-exports the core Try constructor (same pattern as the node and browser
 * entries), including the static `throwThroughErrorTypes` registry.
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
