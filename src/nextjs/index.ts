import { Try as CoreTry, TryResult } from '../core/Try';
import { SentryReporter } from './SentryReporter';

// Set up the Sentry reporter as the default for NextJS
CoreTry.setDefaultReporter(new SentryReporter());

/**
 * NextJS-specific Try class with Sentry integration pre-configured.
 * This extends the core Try class and automatically sets up Sentry reporting.
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
export class Try<T, TArgs extends readonly unknown[] = unknown[]> extends CoreTry<T, TArgs> {
  /**
   * Configure error types that should be thrown through without being wrapped.
   * When using `.report()`, errors matching these types will be re-thrown as-is
   * instead of being wrapped with the custom message.
   *
   * @param ignoreErrorTypes Array of error type names (error.name) to throw through
   *
   * @example
   * ```typescript
   * // Configure to throw ValidationError and AuthError as-is
   * Try.throwThroughErrorTypes(['ValidationError', 'AuthError']);
   *
   * // Now these errors won't be wrapped:
   * await new Try(validateUser, userData)
   *   .report('User validation failed') // ValidationError will be thrown as-is
   *   .unwrap();
   * ```
   */
  public static throwThroughErrorTypes(ignoreErrorTypes: string[]) {
    CoreTry.throwThroughErrorTypes(ignoreErrorTypes);
  }
}

export default Try;
