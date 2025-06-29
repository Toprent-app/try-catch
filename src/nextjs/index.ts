import * as Sentry from '@sentry/nextjs';

/**
 * Configuration for Try execution
 */
interface TryConfig<TArg extends Record<string, any>> {
  readonly message?: string;
  readonly breadcrumbKeys?: readonly (keyof TArg)[];
  readonly tags: Readonly<Record<string, string>>;
  readonly defaultValue?: unknown;
  /**
   * Callback that will always run after the wrapped function finishes
   * executing, regardless of success or failure. Similar to `Promise.prototype.finally`.
   */
  readonly finallyCallback?: () => void;
}

/**
 * Result of Try execution
 */
type TryResult<T> = {
  readonly success: true;
  readonly value: Awaited<T>;
} | {
  readonly success: false;
  readonly error: Error;
}

/**
 * Helper class for simplified async error handling with Sentry integration.
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
export class Try<T, TArgs extends readonly Record<string, any>[] = Record<string, any>[]> {
  private readonly fn: (...args: TArgs) => T | Promise<T>;
  private readonly args: TArgs;
  private config: TryConfig<TArgs[0]>;
  private result?: TryResult<T>;
  private state: 'pending' | 'executed';
  private static ignoreErrorTypes: string[] = []
  /** Tracks whether the user supplied `finally` callback has already been executed */
  private finallyExecuted = false;

  /**
   * Creates a new Try instance for simplified async error handling.
   * 
   * @param fn The function to execute (can be sync or async)
   * @param args Arguments to pass to the function
   * 
   * @example
   * ```typescript
   * // With async function
   * const result = new Try(fetchUser, userId);
   * 
   * // With multiple arguments
   * const result = new Try(updateUser, { id: 1, name: 'John' }, { validateOnly: true });
   * 
   * // Chain configuration methods
   * const value = await new Try(apiCall, params)
   *   .report('API call failed')
   *   .breadcrumbs(['userId', 'action'])
   *   .tag('component', 'user-service')
   *   .unwrap();
   * ```
   */
  constructor(
    fn: (...args: TArgs) => T | Promise<T>,
    ...args: TArgs
  ) {
    this.fn = fn;
    this.args = args;
    this.config = { tags: {} };
    this.state = 'pending';
  }

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
    this.ignoreErrorTypes = ignoreErrorTypes;
  }

  /**
   * Create a new Try instance with updated configuration.
   * This method enables the fluent API by merging new configuration with existing settings.
   * 
   * @param newConfig Partial configuration to merge with existing config
   * @returns The Try instance for method chaining
   */
  private setConfig(newConfig: Partial<TryConfig<TArgs[0]>>): Try<T, TArgs> {
    this.config = { ...this.config, ...newConfig };
    return this;
  }

  /**
   * Configure error reporting to Sentry with a custom message.
   * When an error occurs and this method was called, the error will be captured
   * by Sentry with the provided message and configured context.
   * 
   * @param message Custom error message to report to Sentry
   * @returns The Try instance for method chaining
   * 
   * @example
   * ```typescript
   * // Basic error reporting
   * await new Try(riskyOperation, data)
   *   .report('Failed to process user data')
   *   .unwrap();
   * 
   * // Combined with other configuration
   * await new Try(apiCall, params)
   *   .report('API call failed')
   *   .tag('endpoint', '/users')
   *   .breadcrumbs(['userId'])
   *   .unwrap();
   * ```
   */
  report(message: string): Try<T, TArgs> {
    return this.setConfig({ message });
  }

  /**
   * Configure Sentry breadcrumbs to be extracted from the first function argument.
   * Breadcrumbs provide additional context when errors are reported to Sentry.
   * Only works when the first argument is an object.
   * 
   * @param keys Array of property keys from the first argument to include as breadcrumbs
   * @returns The Try instance for method chaining
   * 
   * @example
   * ```typescript
   * // Extract userId and action as breadcrumbs
   * await new Try(updateUser, { userId: 123, name: 'John', action: 'profile-update' })
   *   .breadcrumbs(['userId', 'action'])
   *   .report('User update failed')
   *   .unwrap();
   * 
   * // Breadcrumbs will be added to Sentry context if an error occurs
   * ```
   */
  breadcrumbs(keys: readonly (keyof TArgs[0])[]): Try<T, TArgs> {
    return this.setConfig({ breadcrumbKeys: keys });
  }

  /**
   * Add a custom tag for Sentry error reporting.
   * Tags help categorize and filter errors in Sentry dashboards.
   * Multiple tags can be added by calling this method multiple times.
   * 
   * @param name The tag name/key
   * @param value The tag value
   * @returns The Try instance for method chaining
   * 
   * @example
   * ```typescript
   * // Add multiple tags for better error categorization
   * await new Try(processPayment, paymentData)
   *   .tag('component', 'payment-service')
   *   .tag('operation', 'charge-card')
   *   .tag('gateway', 'stripe')
   *   .report('Payment processing failed')
   *   .unwrap();
   * ```
   */
  tag(name: string, value: string): Try<T, TArgs> {
    return this.setConfig({
      tags: { ...this.config.tags, [name]: value }
    });
  }

  /**
   * Register a callback that will run after the wrapped function finishes
   * executing (successfully or with an error). The callback runs exactly once
   * per {@link Try} instance, mirroring the behaviour of
   * `Promise.prototype.finally`.
   *
   * The callback is executed **after** the underlying function settles but
   * before any error is re-thrown from {@link unwrap}. It is always executed
   * asynchronously in the same tick as the function resolution.
   *
   * @param callback A function to invoke once the wrapped operation settles.
   * @returns The `Try` instance for method chaining.
   */
  finally(callback: () => void): Try<T, TArgs> {
    return this.setConfig({ finallyCallback: callback });
  }

  /**
   * Configure a default value to return when an error occurs.
   * This default value will be returned by `.value()` method if the function execution fails.
   * The `.unwrap()` method will still throw errors regardless of this setting.
   * 
   * @param defaultValue The value to return when an error occurs
   * @returns The Try instance for method chaining
   * 
   * @example
   * ```typescript
   * // Return empty array if fetching users fails
   * const users = await new Try(fetchUsers)
   *   .default([])
   *   .value(); // Returns [] if fetchUsers throws
   * 
   * // Return null if user lookup fails
   * const user = await new Try(findUser, userId)
   *   .default(null)
   *   .report('User lookup failed')
   *   .value(); // Returns null if findUser throws
   * ```
   */
  default<D>(defaultValue: D): Omit<typeof this, 'value'> & { value(): Promise<Awaited<T> | D> } {
    type WithGuaranteedValue = Omit<typeof this, 'value'> & {
      value(): Promise<Awaited<T> | D>;
    };

    // Cast is safe: runtime shape is unchanged; this only narrows the static
    // return type information for the `value` method.
    return this.setConfig({ defaultValue }) as unknown as WithGuaranteedValue;
  }

  /**
   * Execute the function and return the result, or throw if there was an error.
   * This method will always throw on errors, regardless of default value configuration.
   * If `.report()` was configured, errors will be reported to Sentry before throwing.
   * 
   * @returns The successful result of the function execution
   * @throws The original error or a wrapped error with custom message (depending on configuration)
   * 
   * @example
   * ```typescript
   * // Basic usage - throws on error
   * const result = await new Try(fetchUser, userId).unwrap();
   * 
   * // With error reporting - reports to Sentry then throws
   * const result = await new Try(updateUser, userData)
   *   .report('User update failed')
   *   .unwrap();
   * 
   * // With custom message - throws Error with custom message instead of original
   * try {
   *   await new Try(riskyOperation).report('Operation failed').unwrap();
   * } catch (error) {
   *   console.log(error.message); // "Operation failed"
   * }
   * ```
   */
  async unwrap(): Promise<Awaited<T>> {
    const result = await this.execute();

    if (!result.success) {
      // Decide if we need to capture
      const shouldCapture = this.config.message;

      if (shouldCapture) {
        await this.reportError(result.error);
      }

      // Throw a wrapped error with custom message when provided, otherwise re-throw original
      if (this.config.message && !Try.ignoreErrorTypes.includes(result.error.name)) {
        throw new Error(this.config.message);
      }
      throw result.error;
    }

    return result.value;
  }

  /**
   * Execute the function and return the error if one occurred, or undefined if successful.
   * This method never throws - it returns the error as a value instead.
   * Errors are not reported to Sentry when using this method.
   * 
   * @returns The error if execution failed, undefined if successful
   * 
   * @example
   * ```typescript
   * // Check for errors without throwing
   * const error = await new Try(riskyOperation, data).error();
   * if (error) {
   *   console.log('Operation failed:', error.message);
   *   // Handle error gracefully
   * }
   * 
   * // Conditional logic based on error type
   * const error = await new Try(validateInput, userInput).error();
   * if (error instanceof ValidationError) {
   *   showValidationMessage(error.message);
   * } else if (error) {
   *   showGenericError();
   * }
   * ```
   */
  async error(): Promise<Error | undefined> {
    const result = await this.execute();
    return result.success ? undefined : result.error;
  }

  /**
   * Execute the function and return the value if successful, or a default value/undefined if there was an error.
   * This method never throws - it returns undefined (or configured default) on errors.
   * If `.report()` was configured, errors will be reported to Sentry.
   * If breadcrumbs were configured, they will be added to Sentry context.
   * 
   * @returns The successful result, configured default value, or undefined if execution failed
   * 
   * @example
   * ```typescript
   * // Basic usage - returns undefined on error
   * const user = await new Try(fetchUser, userId).value();
   * if (user) {
   *   displayUser(user);
   * }
   * 
   * // With default value - returns default on error
   * const users = await new Try(fetchUsers)
   *   .default([])
   *   .value(); // Returns [] if fetchUsers fails
   * 
   * // With error reporting - reports to Sentry but still returns undefined
   * const result = await new Try(criticalOperation)
   *   .report('Critical operation failed')
   *   .breadcrumbs(['operationId'])
   *   .value(); // undefined if failed, but error is reported to Sentry
   * ```
   */
  async value(): Promise<Awaited<T> | undefined> {
    const result = await this.execute();

    if (result.success) {
      return result.value;
    }

    // Add breadcrumbs when configured regardless of reporting strategy.
    if (this.config.breadcrumbKeys?.length) {
      await this.addBreadcrumbsIfConfigured();
    }

    // Report error only when the consumer has explicitly opted-in via `.report()`
    if (this.config.message) {
      await this.reportError(result.error);
    }

    // Return configured default when error occurs, otherwise undefined
    return (this.config.defaultValue ?? undefined) as any;
  }

  /**
   * Execute the function and return a result object with success status, value, and error.
   * This is the core execution method that handles both sync and async functions.
   * Results are cached after first execution to avoid re-running the function.
   * 
   * @returns Promise resolving to a result object indicating success/failure
   */
  private async execute(): Promise<TryResult<T>> {
    if (this.state === 'executed' && this.result) {
      return this.result;
    }

    try {
      const value = await this.fn(...this.args);
      this.result = { success: true, value };
    } catch (e) {
      console.error(e);
      const error = e as Error;
      this.result = { success: false, error };
    } finally {
      this.state = 'executed';
      try {
        this.config.finallyCallback?.();
      } catch (err) {
        console.error('Error in finally callback', err);
      }
    }

    return this.result;
  }

  /**
   * Report error to Sentry with configured context.
   */
  private async reportError(error: Error): Promise<void> {
    this.addBreadcrumbsIfConfigured();

    Sentry.captureException(this.createWrappedError(error), { tags: { ...this.config.tags, library: '@power-rent/try-catch' } });
  }

  /**
   * Add breadcrumbs to Sentry if configured.
   */
  private addBreadcrumbsIfConfigured(): void {
    if (!this.config.breadcrumbKeys?.length) {
      return;
    }

    const firstArg = this.args[0];
    if (!firstArg || typeof firstArg !== 'object') {
      return;
    }

    const breadcrumbData = this.extractBreadcrumbData(firstArg);
    Sentry.addBreadcrumb({ data: breadcrumbData });
  }

  /**
   * Extract breadcrumb data from the first argument using configured keys.
   */
  private extractBreadcrumbData(firstArg: TArgs[0]): Record<string, any> {
    const breadcrumbData: Record<string, unknown> = {};

    this.config.breadcrumbKeys!.forEach((key) => {
      breadcrumbData[key as string] = firstArg[key];
    });

    return breadcrumbData;
  }

  /**
   * Create a wrapped error with the configured message.
   */
  private createWrappedError(error: Error): Error {
    if (!this.config.message) {
      return error;
    }

    // @ts-ignore cause is missing in the definition
    return new Error(this.config.message, { cause: error });
  }

  /**
   * Make the Try instance thenable so it can be `await`-ed directly.
   * This executes the underlying function with the current configuration and resolves
   * with the same result as calling `.value()` (never throws, returns undefined on error).
   * 
   * @param onfulfilled Callback for successful resolution
   * @param onrejected Callback for rejection (rarely used since this doesn't reject)
   * @returns Promise that resolves with the result or undefined
   * 
   * @example
   * ```typescript
   * // Direct await - equivalent to .value()
   * const user = await new Try(fetchUser, userId)
   *   .report('Failed to fetch user');
   * 
   * // Can be used in Promise chains
   * const result = await new Try(processData, input)
   *   .default('fallback')
   *   .then(data => data?.toUpperCase() || 'NO DATA');
   * 
   * // Behaves like .value() - never throws
   * const users = await new Try(fetchUsers); // undefined if error
   * ```
   */
  then<TResult1 = Awaited<T> | undefined, TResult2 = never>(
    onfulfilled?: ((value: Awaited<T> | undefined) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.value().then(onfulfilled as any, onrejected as any);
  }
}

export default Try; 
