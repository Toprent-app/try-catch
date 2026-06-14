import * as Sentry from '@sentry/nextjs';
import { createSentryReporter } from '../adapters/createSentryReporter';

/**
 * Next.js Sentry reporter (uses @sentry/nextjs).
 * Behaviour lives in the shared {@link createSentryReporter} factory.
 */
export const sentryReporter = createSentryReporter(Sentry);
