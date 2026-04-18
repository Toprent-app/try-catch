import {
  BreadcrumbOptions,
  BreadcrumbConfig,
  BreadcrumbTransformer,
  PositionalBreadcrumbs,
  VariadicBreadcrumbTransformers,
  ValidateKeys,
  BreadcrumbExtractor as BreadcrumbExtractorType,
  BreadcrumbExtractorUtil,
} from '../utils';
import { Reporter, NoopReporter } from './reporter';

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

type PromiseLikeValue<TValue = unknown> = { then: (value: TValue) => unknown };

function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return !!value && typeof (value as PromiseLikeValue).then === 'function';
}

/**
 * Resolves to True when T is or may be a Promise (so callers must handle async).
 * For Promise<T> | T (mixed return type), resolves to True so value()/unwrap()
 * are typed as returning Promise<...> and the value is handled via await.
 */
type IfPromise<T, True, False> = [T] extends [never]
  ? False
  : (T extends PromiseLike<unknown> ? True : False) extends False
    ? False
    : True;

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
export class Try<
  TReturn,
  TArgs extends readonly unknown[] = unknown[],
  TDefault = undefined,
> {
  private readonly fn: (...args: TArgs) => TReturn;
  private readonly args: TArgs;
  private config: TryConfig<TArgs>;
  private exec: {
    state: 'pending' | 'executed';
    result?: TryResult<TReturn>;
    promise?: Promise<TryResult<TReturn>>;
    isAsync?: boolean;
    finallyRan: boolean;
    // Set of breadcrumbConfig objects whose breadcrumbs have already been
    // emitted for this shared execution. Shared across .default() clones so
    // a parent + child referencing the same config emit breadcrumbs only
    // once, while divergent configs each emit independently.
    breadcrumbsEmitted: Set<BreadcrumbOptions<TArgs>>;
  };
  private local: {
    breadcrumbData?: Record<string, unknown>;
    breadcrumbsAdded: boolean;
  };
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
   * @param args Arguments to pass to the function (various types: strings, numbers, objects, etc.)
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
  constructor(fn: (...args: TArgs) => TReturn, ...args: TArgs) {
    this.fn = fn;
    this.args = args;
    this.config = { tags: {} };
    this.exec = { state: 'pending', finallyRan: false, breadcrumbsEmitted: new Set() };
    this.local = { breadcrumbsAdded: false };
    // Only `AsyncFunction`s are thenable: `installThenable()` defines an owned
    // `.then` data property so `await new Try(asyncFn)` works without
    // triggering execution at probe time. Non-async functions (including
    // sync functions that happen to return a Promise) are NOT thenable —
    // any thenability probe (Promise.resolve, util.inspect, jest deep-equal,
    // Sentry serialization, ...) must never silently invoke the wrapped
    // function. Use `.value()` / `.unwrap()` / `.error()` / `.result()`
    // (which still handle Promise-returning sync fns via `execute()`).
    if (fn.constructor.name === 'AsyncFunction') {
      this.installThenable();
    }
  }

  /**
   * Install a thenable `.then` method directly on this instance for
   * `AsyncFunction`-wrapped Try instances. Defers to `.value()` (never throws;
   * returns the configured default on error) and wraps in `Promise.resolve(...)`
   * so it also works once the underlying promise has settled.
   */
  private installThenable(): void {
    const thenFn = (
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ): Promise<unknown> =>
      Promise.resolve(this.value() as unknown).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined,
      );
    Object.defineProperty(this, 'then', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: thenFn,
    });
  }

  /**
   * Configure error types that should be thrown through without being wrapped
   * AND without being reported to the configured Reporter (Sentry).
   * When using `.report()`, errors matching these types are re-thrown as-is
   * and `Reporter.report()` is NOT called for them. Breadcrumbs configured via
   * `.breadcrumbs()` are still recorded.
   *
   * @param ignoreErrorTypes Array of error type names (error.name) to throw through
   *
   * @example
   * ```typescript
   * // Configure to throw ValidationError and AuthError as-is (and skip Sentry)
   * Try.throwThroughErrorTypes(['ValidationError', 'AuthError']);
   *
   * // Now these errors won't be wrapped or sent to Sentry:
   * await new Try(validateUser, userData)
   *   .report('User validation failed') // ValidationError throws as-is, no captureException
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
  private setConfig(newConfig: Partial<TryConfig<TArgs>>): this {
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
  report(message: string): this {
    return this.setConfig({ message });
  }

  /**
   * Configure breadcrumbs with flexible extraction from the function's parameters.
   * Breadcrumbs provide additional context when errors are reported.
   * The function name is automatically included in all breadcrumbs for better traceability.
   *
   * **Flexible Usage**: Extract breadcrumbs from a parameter position, transform primitives,
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
  breadcrumbs<const Keys extends readonly string[]>(
    keys: ValidateKeys<TArgs, Keys>,
  ): this;

  breadcrumbs<T extends VariadicBreadcrumbTransformers<TArgs>>(
    ...transformers: T
  ): this;

  breadcrumbs(config: readonly BreadcrumbExtractorType<TArgs>[]): this;

  breadcrumbs(config: BreadcrumbConfig<TArgs>): this;

  breadcrumbs<const Config extends PositionalBreadcrumbs<TArgs>>(
    config: Config extends readonly string[] ? never : Config,
  ): this;

  breadcrumbs(
    configOrFirstTransformer?:
      | BreadcrumbOptions<TArgs>
      | BreadcrumbTransformer<unknown>,
    ...restTransformers: BreadcrumbTransformer<unknown>[]
  ): this {
    // Handle variadic transformer functions
    if (typeof configOrFirstTransformer === 'function') {
      const allTransformers = [configOrFirstTransformer, ...restTransformers];
      return this.setConfig({
        breadcrumbConfig: allTransformers as BreadcrumbOptions<TArgs>,
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
  tag(name: string, value: string): this {
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
  tags(tagRecord: Record<string, string>): this {
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
   * before the error is re-thrown from {@link unwrap}. It runs synchronously
   * for sync functions and is awaited for async functions.
   *
   * @param callback A function to invoke once the wrapped operation settles. Can be sync or async.
   * @returns The `Try` instance for method chaining.
   */
  finally(callback: () => void | Promise<void>): this {
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
  debug(enabled: boolean = true): this {
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
  default<D>(defaultValue: D): Try<TReturn, TArgs, D> {
    const next = new Try<TReturn, TArgs, D>(this.fn, ...this.args);
    next.config = { ...this.config, defaultValue };
    next.exec = this.exec;
    return next;
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
  unwrap(): IfPromise<TReturn, Promise<Awaited<TReturn>>, Awaited<TReturn>> {
    const result = this.execute();

    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) => {
        if (!resolved.success) {
          const isThrowThrough = Try.ignoreErrorTypes.includes(
            resolved.error.name,
          );
          const shouldCapture = this.config.message && !isThrowThrough;

          if (shouldCapture) {
            this.reportError(resolved.error);
          } else if (this.config.breadcrumbConfig) {
            this.addBreadcrumbsIfConfigured();
          }

          if (this.config.message && !isThrowThrough) {
            const wrappedError = Try.defaultReporter.createWrappedError(
              resolved.error,
              this.config.message,
            );
            throw wrappedError;
          }
          throw resolved.error;
        }

        return resolved.value;
      }) as IfPromise<TReturn, Promise<Awaited<TReturn>>, Awaited<TReturn>>;
    }

    if (!result.success) {
      const isThrowThrough = Try.ignoreErrorTypes.includes(result.error.name);
      const shouldCapture = this.config.message && !isThrowThrough;

      if (shouldCapture) {
        this.reportError(result.error);
      } else if (this.config.breadcrumbConfig) {
        this.addBreadcrumbsIfConfigured();
      }

      if (this.config.message && !isThrowThrough) {
        const wrappedError = Try.defaultReporter.createWrappedError(
          result.error,
          this.config.message,
        );
        throw wrappedError;
      }
      throw result.error;
    }

    return result.value as IfPromise<
      TReturn,
      Promise<Awaited<TReturn>>,
      Awaited<TReturn>
    >;
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
  result(): IfPromise<
    TReturn,
    Promise<TryResult<TReturn>>,
    TryResult<TReturn>
  > {
    const result = this.execute();
    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) => {
        if (!resolved.success && this.config.breadcrumbConfig) {
          this.addBreadcrumbsIfConfigured();
        }
        return resolved;
      }) as IfPromise<TReturn, Promise<TryResult<TReturn>>, TryResult<TReturn>>;
    }
    if (!result.success && this.config.breadcrumbConfig) {
      this.addBreadcrumbsIfConfigured();
    }
    return result as IfPromise<
      TReturn,
      Promise<TryResult<TReturn>>,
      TryResult<TReturn>
    >;
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
  error(): IfPromise<TReturn, Promise<Error | undefined>, Error | undefined> {
    const result = this.execute();

    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) => {
        if (resolved.success) return undefined;
        if (this.config.breadcrumbConfig) {
          this.addBreadcrumbsIfConfigured();
        }
        return resolved.error;
      }) as IfPromise<TReturn, Promise<Error | undefined>, Error | undefined>;
    }

    if (result.success) {
      return undefined as IfPromise<TReturn, Promise<Error | undefined>, Error | undefined>;
    }
    if (this.config.breadcrumbConfig) {
      this.addBreadcrumbsIfConfigured();
    }
    return result.error as IfPromise<
      TReturn,
      Promise<Error | undefined>,
      Error | undefined
    >;
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
  value(): IfPromise<
    TReturn,
    Promise<Awaited<TReturn> | TDefault>,
    Awaited<TReturn> | TDefault
  > {
    const result = this.execute();

    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) => {
        if (resolved.success) {
          return resolved.value;
        }

        const isThrowThrough = Try.ignoreErrorTypes.includes(
          resolved.error.name,
        );
        if (this.config.message && !isThrowThrough) {
          this.reportError(resolved.error);
        } else if (this.config.breadcrumbConfig) {
          this.addBreadcrumbsIfConfigured();
        }

        return this.config.defaultValue as TDefault;
      }) as IfPromise<
        TReturn,
        Promise<Awaited<TReturn> | TDefault>,
        Awaited<TReturn> | TDefault
      >;
    }

    if (result.success) {
      return result.value as IfPromise<
        TReturn,
        Promise<Awaited<TReturn> | TDefault>,
        Awaited<TReturn> | TDefault
      >;
    }

    const isThrowThrough = Try.ignoreErrorTypes.includes(result.error.name);
    if (this.config.message && !isThrowThrough) {
      this.reportError(result.error);
    } else if (this.config.breadcrumbConfig) {
      this.addBreadcrumbsIfConfigured();
    }

    return this.config.defaultValue as IfPromise<
      TReturn,
      Promise<Awaited<TReturn> | TDefault>,
      Awaited<TReturn> | TDefault
    >;
  }

  /**
   * Execute the function and return a result object with success status, value, and error.
   * This is the core execution method that handles both sync and async functions.
   * Results are cached after first execution to avoid re-running the function.
   *
   * @returns Promise resolving to a result object indicating success/failure
   */
  private execute(): TryResult<TReturn> | Promise<TryResult<TReturn>> {
    if (this.exec.state === 'executed' && this.exec.result) {
      return this.exec.isAsync
        ? (this.exec.promise as Promise<TryResult<TReturn>>)
        : this.exec.result;
    }

    if (this.exec.promise) {
      return this.exec.promise;
    }

    try {
      const value = this.fn(...this.args);

      if (isPromiseLike<Awaited<TReturn>>(value)) {
        this.exec.isAsync = true;
        this.exec.promise = Promise.resolve(value)
          .then((resolved) => {
            this.exec.result = {
              success: true,
              value: resolved as Awaited<TReturn>,
            };
            return this.exec.result;
          })
          .catch((e: unknown) => {
            if (this.config.debug) {
              console.error(e);
            }
            const error = Try.normalizeThrown(e);
            this.exec.result = { success: false, error };
            return this.exec.result;
          })
          .finally(() => {
            this.exec.state = 'executed';
            return this.runFinallyCallback();
          });

        return this.exec.promise;
      }

      this.exec.isAsync = false;
      this.exec.result = {
        success: true,
        value: value as Awaited<TReturn>,
      };
    } catch (e) {
      if (this.config.debug) {
        console.error(e);
      }
      const error = Try.normalizeThrown(e);
      this.exec.isAsync = false;
      this.exec.result = { success: false, error };
    } finally {
      this.exec.state = 'executed';
      if (!this.exec.isAsync) {
        void this.runFinallyCallback();
      }
    }

    return this.exec.result;
  }

  private static normalizeThrown(e: unknown): Error {
    if (e instanceof Error) return e;
    const wrapped = new Error(`Non-Error thrown (${typeof e})`);
    wrapped.cause = e;
    return wrapped;
  }

  private runFinallyCallback(): void | Promise<void> {
    if (!this.config.finallyCallback || this.exec.finallyRan) {
      return;
    }
    this.exec.finallyRan = true;

    try {
      const result = this.config.finallyCallback();
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch((err: unknown) => {
          if (this.config.debug) {
            console.error('Error in finally callback', err);
          }
        });
      }
    } catch (err) {
      if (this.config.debug) {
        console.error('Error in finally callback', err);
      }
    }
  }

  /**
   * Report error using the configured reporter with context.
   */
  private reportError(error: Error): void {
    this.addBreadcrumbsIfConfigured();

    Try.defaultReporter.report(error, {
      message: this.config.message,
      tags: this.config.tags,
    });
  }

  /**
   * Add breadcrumbs using the configured reporter if configured.
   */
  private addBreadcrumbsIfConfigured(): void {
    if (!this.config.breadcrumbConfig || this.local.breadcrumbsAdded) {
      return;
    }

    // Guard against duplicate emission across shared execution. Parent and
    // child clones (via .default()) share `exec`; if they reference the same
    // breadcrumbConfig they must emit at most once per shared failure.
    if (this.exec.breadcrumbsEmitted.has(this.config.breadcrumbConfig)) {
      this.local.breadcrumbsAdded = true;
      return;
    }

    if (!this.local.breadcrumbData) {
      this.local.breadcrumbData = this.extractAllBreadcrumbData();
    }

    // Skip the reporter call when no data was extracted. Do not set the
    // idempotence guard here — `breadcrumbConfig` is immutable on a single
    // instance, so "empty now" implies "empty on any retry" and there is
    // no double-recording risk from leaving the guard unset.
    if (Object.keys(this.local.breadcrumbData).length === 0) {
      return;
    }

    const functionName = this.fn.name || 'anonymous';

    Try.defaultReporter.addBreadcrumbs(this.local.breadcrumbData, functionName);
    this.local.breadcrumbsAdded = true;
    this.exec.breadcrumbsEmitted.add(this.config.breadcrumbConfig);
  }

  /**
   * Extract breadcrumb data using the flexible configuration.
   */
  private extractAllBreadcrumbData(): Record<string, unknown> {
    const config = this.config.breadcrumbConfig;
    if (!config) {
      return {};
    }
    return BreadcrumbExtractorUtil.extract(
      config,
      this.args,
      this.config.debug,
    );
  }

  /**
   * Make the Try instance thenable so it can be `await`-ed directly (async only).
   * This executes the underlying function with the current configuration and resolves
   * with the same result as calling `.value()` (never throws, returns undefined on error).
   *
   * For sync wrapped functions, `.then` is typed as `never` to prevent misuse —
   * use `.value()` / `.unwrap()` directly instead of awaiting.
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
  declare then: IfPromise<
    TReturn,
    <TResult1 = Awaited<TReturn> | TDefault, TResult2 = never>(
      onfulfilled?:
        | ((
            value: Awaited<TReturn> | TDefault,
          ) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) => Promise<TResult1 | TResult2>,
    never
  >;
}
