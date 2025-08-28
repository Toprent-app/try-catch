import {
  BreadcrumbOptions,
  BreadcrumbTransformer,
  VariadicBreadcrumbTransformers,
  ValidateKeys,
  BreadcrumbExtractor as BreadcrumbExtractorType,
  BreadcrumbExtractorUtil,
} from '../utils';
import { Reporter, NoopReporter, ErrorReportConfig } from './reporter';

/**
 * Configuration for Try execution
 */
interface TryConfig<TArgs extends readonly unknown[] = unknown[]> {
  readonly message?: string;
  readonly breadcrumbConfig?: BreadcrumbOptions<TArgs>;
  readonly tags: Readonly<Record<string, string>>;
  readonly defaultValue?: unknown;
  /**
   * Callback that will always run after the wrapped function finishes
   * executing, regardless of success or failure. Similar to `Promise.prototype.finally`.
   */
  readonly finallyCallback?: () => void | Promise<void>;
  /**
   * Enable debug logging to console. When true, errors will be logged to console.error.
   * Libraries should not log by default - this is an opt-in feature.
   */
  readonly debug?: boolean;
}

/**
 * Result of Try execution
 */
export type TryResult<T> =
  | {
    readonly success: true;
    readonly value: Awaited<T>;
  }
  | {
    readonly success: false;
    readonly error: Error;
  };

/**
 * Core Try class for simplified async error handling.
 * This implementation is framework-agnostic and uses a Reporter interface
 * to decouple error reporting from specific services.
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
export class Try<T, TArgs extends readonly unknown[] = unknown[]> {
  private readonly fn: (...args: TArgs) => T | Promise<T>;
  private readonly args: TArgs;
  private config: TryConfig<TArgs>;
  private cachedResult?: TryResult<T>;
  private cachedBreadcrumbData?: Record<string, unknown>;
  private breadcrumbsAdded: boolean = false;
  private state: 'pending' | 'executed';
  private static ignoreErrorTypes: string[] = [];
  private static defaultReporter: Reporter = new NoopReporter();

  /**
   * Set the default reporter for all Try instances
   * @param reporter The reporter implementation to use
   */
  static setDefaultReporter(reporter: Reporter): void {
    Try.defaultReporter = reporter;
  }

  /**
   * Get the current default reporter
   */
  static getDefaultReporter(): Reporter {
    return Try.defaultReporter;
  }

  /**
   * Creates a new Try instance for simplified async error handling.
   *
   * @param fn The function to execute (can be sync or async)
   * @param args Arguments to pass to the function (any types: strings, numbers, objects, etc.)
   *
   * @example
   * ```typescript
   * // With string parameters
   * const result = new Try(greet, 'Alice', 'Hello');
   *
   * // With number parameters
   * const sum = new Try(add, 5, 3);
   *
   * // With object parameters (enables breadcrumbs)
   * const result = new Try(updateUser, { id: 1, name: 'John' }, { validateOnly: true });
   *
   * // With mixed parameter types
   * const result = new Try(formatMessage, 123, 'Error occurred', true);
   *
   * // Chain configuration methods (breadcrumbs only available with object parameters)
   * const value = await new Try(apiCall, { userId: 123, action: 'update' })
   *   .report('API call failed')
   *   .breadcrumbs(['userId', 'action'])  // Only works with object first parameter
   *   .tag('component', 'user-service')
   *   .unwrap();
   *
   * // Non-object parameters (breadcrumbs not available)
   * const value = await new Try(processString, 'hello world')
   *   .report('Processing failed')
   *   .tag('operation', 'string-process')
   *   .unwrap();
   * ```
   */
  constructor(fn: ((...args: TArgs) => T | Promise<T>), ...args: TArgs) {
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
  private setConfig(newConfig: Partial<TryConfig<TArgs>>): Try<T, TArgs> {
    this.config = { ...this.config, ...newConfig };
    return this;
  }

  /**
   * Configure error reporting with a custom message.
   * When an error occurs and this method was called, the error will be captured
   * by the configured reporter with the provided message and configured context.
   *
   * @param message Custom error message to report
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
   * Configure breadcrumbs with flexible extraction from any function parameters.
   * Breadcrumbs provide additional context when errors are reported.
   * The function name is automatically included in all breadcrumbs for better traceability.
   *
   * **Flexible Usage**: Extract breadcrumbs from any parameter position, transform primitives,
   * or combine data from multiple parameters.
   *
   * @param config Breadcrumb configuration - supports multiple syntax styles
   * @returns The Try instance for method chaining
   *
   * @example
   * ```typescript
   * // ✅ Extract from first parameter (object)
   * await new Try(updateUser, { userId: 123, name: 'John' })
   *   .breadcrumbs(['userId', 'name'])
   *   .report('User update failed')
   *   .unwrap();
   *
   * // ✅ Array syntax - extract from multiple parameters
   * await new Try(processOrder, 'order-123', { customerId: 456 }, true)
   *   .breadcrumbs(
   *     'value',  // { value: 'order-123' }
   *     ['customerId'],  // { customerId: 456 }
   *     'urgent',  // { urgent: true }
   *   )
   *   .unwrap();
   *
   * // ✅ Object syntax - parameter index as keys
   * await new Try(apiCall, endpoint, { userId: 123 }, headers)
   *   .breadcrumbs({
   *     0: (url) => ({ endpoint: url }),       // transform string
   *     1: ['userId'],                        // extract from object
   *     2: (h) => ({ headerCount: Object.keys(h).length })
   *   })
   *   .unwrap();
   * ```
   */
  breadcrumbs<Keys extends readonly (keyof TArgs[0])[]>(
    keys: Keys
  ): Try<T, TArgs>;

  breadcrumbs<T extends VariadicBreadcrumbTransformers<TArgs>>(...transformers: T): Try<T, TArgs>;

  breadcrumbs(config: BreadcrumbOptions<TArgs>): Try<T, TArgs>;

  breadcrumbs(
    configOrFirstTransformer?:
      | BreadcrumbOptions<TArgs>
      | BreadcrumbTransformer<any>,
    ...restTransformers: BreadcrumbTransformer<any>[]
  ): Try<T, TArgs> {
    // Handle variadic transformer functions
    if (typeof configOrFirstTransformer === 'function') {
      const allTransformers = [configOrFirstTransformer, ...restTransformers];
      return this.setConfig({
        breadcrumbConfig: allTransformers as unknown as BreadcrumbOptions<TArgs>,
      });
    }

    return this.setConfig({
      breadcrumbConfig: configOrFirstTransformer as BreadcrumbOptions<TArgs>,
    });
  }

  /**
   * Add a custom tag for error reporting.
   * Tags help categorize and filter errors in reporting dashboards.
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
      tags: { ...this.config.tags, [name]: value },
    });
  }

  /**
   * Add multiple custom tags for error reporting at once.
   * This is a convenience method for setting many tags without chaining multiple .tag() calls.
   * Tags help categorize and filter errors in reporting dashboards.
   *
   * @param tagRecord A record/object containing tag name-value pairs
   * @returns The Try instance for method chaining
   *
   * @example
   * ```typescript
   * // Set multiple tags at once
   * await new Try(processPayment, paymentData)
   *   .tags({
   *     component: 'payment-service',
   *     operation: 'charge-card',
   *     gateway: 'stripe',
   *     version: '2.1.0'
   *   })
   *   .report('Payment processing failed')
   *   .unwrap();
   *
   * // Can be combined with individual tag() calls
   * await new Try(processData, data)
   *   .tags({ module: 'data-processor', version: '1.0' })
   *   .tag('requestId', generateId())
   *   .report('Processing failed')
   *   .value();
   * ```
   */
  tags(tagRecord: Record<string, string>): Try<T, TArgs> {
    return this.setConfig({
      tags: { ...this.config.tags, ...tagRecord },
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
   * @param callback A function to invoke once the wrapped operation settles. Can be sync or async.
   * @returns The `Try` instance for method chaining.
   */
  finally(callback: () => void | Promise<void>): Try<T, TArgs> {
    return this.setConfig({ finallyCallback: callback });
  }

  /**
   * Enable debug logging to console. When enabled, errors will be logged to console.error.
   * This is an opt-in feature since libraries should not log by default.
   *
   * @param enabled Whether to enable debug logging (defaults to true)
   * @returns The Try instance for method chaining
   *
   * @example
   * ```typescript
   * // Enable debug logging
   * await new Try(riskyOperation, data)
   *   .debug()
   *   .report('Operation failed')
   *   .value();
   *
   * // Explicitly disable debug logging
   * await new Try(riskyOperation, data)
   *   .debug(false)
   *   .value();
   *
   * // Conditional debug logging
   * await new Try(riskyOperation, data)
   *   .debug(process.env.NODE_ENV === 'development')
   *   .value();
   * ```
   */
  debug(enabled: boolean = true): Try<T, TArgs> {
    return this.setConfig({ debug: enabled });
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
  default<D>(
    defaultValue: D,
  ): Omit<typeof this, 'value'> & { value(): Promise<Awaited<T> | D> } {
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
   * If `.report()` was configured, errors will be reported before throwing.
   *
   * @returns The successful result of the function execution
   * @throws The original error or a wrapped error with custom message (depending on configuration)
   *
   * @example
   * ```typescript
   * // Basic usage - throws on error
   * const result = await new Try(fetchUser, userId).unwrap();
   *
   * // With error reporting - reports then throws
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
      if (
        this.config.message &&
        !Try.ignoreErrorTypes.includes(result.error.name)
      ) {
        const wrappedError = Try.defaultReporter.createWrappedError(
          result.error,
          this.config.message,
        );
        throw wrappedError;
      }
      throw result.error;
    }

    return result.value;
  }

  /**
   * Execute the function and return a result object containing either the value or error.
   * This method never throws - it returns a discriminated union that you can pattern match on.
   * Errors are not reported when using this method.
   *
   * @returns A result object with success flag, value (on success), or error (on failure)
   *
   * @example
   * ```typescript
   * // Pattern matching on result
   * const result = await new Try(riskyOperation, data).result();
   * if (result.success) {
   *   console.log('Success:', result.value);
   * } else {
   *   console.log('Error:', result.error.message);
   * }
   *
   * // Destructuring with type safety
   * const { success, value, error } = await new Try(fetchUser, userId).result();
   * if (success) {
   *   displayUser(value); // TypeScript knows value exists
   * } else {
   *   handleError(error); // TypeScript knows error exists
   * }
   *
   * // Functional style with exhaustive matching
   * const message = await new Try(processData, input)
   *   .result()
   *   .then(result =>
   *     result.success
   *       ? `Processed: ${result.value}`
   *       : `Failed: ${result.error.message}`
   *   );
   * ```
   */
  async result(): Promise<TryResult<T>> {
    return this.execute();
  }

  /**
   * Execute the function and return the error if one occurred, or undefined if successful.
   * This method never throws - it returns the error as a value instead.
   * Errors are not reported when using this method.
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
   * If `.report()` was configured, errors will be reported.
   * If breadcrumbs were configured, they will be added to the reporting context.
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
   * // With error reporting - reports but still returns undefined
   * const result = await new Try(criticalOperation)
   *   .report('Critical operation failed')
   *   .breadcrumbs(['operationId'])
   *   .value(); // undefined if failed, but error is reported
   * ```
   */
  async value(): Promise<Awaited<T> | undefined> {
    const result = await this.execute();

    if (result.success) {
      return result.value;
    }

    // Report error only when the consumer has explicitly opted-in via `.report()`
    if (this.config.message) {
      await this.reportError(result.error);
    } else if (this.config.breadcrumbConfig) {
      // Add breadcrumbs when configured but not reporting
      this.addBreadcrumbsIfConfigured();
    }

    // Return configured default when error occurs, otherwise undefined
    return (this.config.defaultValue as any) ?? undefined;
  }

  /**
   * Execute the function and return a result object with success status, value, and error.
   * This is the core execution method that handles both sync and async functions.
   * Results are cached after first execution to avoid re-running the function.
   *
   * @returns Promise resolving to a result object indicating success/failure
   */
  private async execute(): Promise<TryResult<T>> {
    if (this.state === 'executed' && this.cachedResult) {
      return this.cachedResult;
    }

    try {
      const value = await this.fn(...this.args);
      this.cachedResult = { success: true, value };
    } catch (e) {
      if (this.config.debug) {
        console.error(e);
      }
      const error = e as Error;
      this.cachedResult = { success: false, error };
    } finally {
      this.state = 'executed';
      try {
        await Promise.resolve(this.config.finallyCallback?.());
      } catch (err) {
        if (this.config.debug) {
          console.error('Error in finally callback', err);
        }
      }
    }

    return this.cachedResult;
  }

  /**
   * Report error using the configured reporter with context.
   */
  private async reportError(error: Error): Promise<void> {
    this.addBreadcrumbsIfConfigured();

    Try.defaultReporter.report(error, {
      message: this.config.message,
      tags: this.config.tags,
      breadcrumbData: this.cachedBreadcrumbData,
      functionName: this.fn.name,
    });
  }

  /**
   * Add breadcrumbs using the configured reporter if configured.
   */
  private addBreadcrumbsIfConfigured(): void {
    if (!this.config.breadcrumbConfig || this.breadcrumbsAdded) {
      return;
    }

    // Cache breadcrumb data to avoid re-computation
    if (!this.cachedBreadcrumbData) {
      this.cachedBreadcrumbData = this.extractAllBreadcrumbData();
    }

    // Add function name to breadcrumbs for better context
    const functionName = this.fn.name || 'anonymous';

    Try.defaultReporter.addBreadcrumbs(this.cachedBreadcrumbData, functionName);
    this.breadcrumbsAdded = true;
  }

  /**
   * Extract breadcrumb data using the flexible configuration.
   */
  private extractAllBreadcrumbData(): Record<string, unknown> {
    const config = this.config.breadcrumbConfig!;
    return BreadcrumbExtractorUtil.extract(
      config,
      this.args,
      this.config.debug,
    );
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
    onfulfilled?:
      | ((value: Awaited<T> | undefined) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.value().then(onfulfilled as any, onrejected as any);
  }
}
