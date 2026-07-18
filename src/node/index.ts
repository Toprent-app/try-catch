export { Try, Try as default, TryResult } from '../core/Try';
import { NodeReporter } from '../adapters/node/reporter';
import { installNodeScopeProvider } from '../adapters/node/scopeProvider';
import { setDefaultReporterIfAbsent } from '../core/scope';

// Install the Node reporter as the default unless one is already set (first-wins
// across entry bundles in one realm; an explicit Try.setDefaultReporter still
// overrides).
setDefaultReporterIfAbsent(new NodeReporter());
// Enable report-once aggregation via AsyncLocalStorage (Node runtime).
installNodeScopeProvider();

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
