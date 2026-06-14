import * as Sentry from '@sentry/node';
import { createSentryReporter } from '../createSentryReporter';

/**
 * Node.js Sentry reporter (uses @sentry/node for server-side error reporting).
 * Behaviour lives in the shared {@link createSentryReporter} factory.
 */
export const nodeReporter = createSentryReporter(Sentry);
