export { Try, Try as default, TryResult } from '../core/Try';
export type { PublicTry } from '../core/Try';
import { Try as TryClass } from '../core/Try';
import { sentryReporter } from './SentryReporter';

// Set up the Sentry reporter as the default for NextJS
TryClass.setDefaultReporter(sentryReporter);

/**
 * NextJS-specific Try entry with Sentry integration pre-configured.
 * Re-exports the core Try constructor (same pattern as node/browser).
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
