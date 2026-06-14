import * as Sentry from '@sentry/browser';
import { createSentryReporter } from '../createSentryReporter';

/**
 * Browser Sentry reporter (uses @sentry/browser for client-side reporting).
 * Behaviour lives in the shared {@link createSentryReporter} factory.
 */
export const browserReporter = createSentryReporter(Sentry);
