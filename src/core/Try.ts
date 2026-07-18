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
import { Reporter, ErrorReportConfig } from './reporter';
import {
  Scope,
  Collected,
  ScopeProvider,
  getScopeProvider as readScopeProvider,
  setScopeProvider as writeScopeProvider,
  getDefaultReporter as readDefaultReporter,
  setDefaultReporter as writeDefaultReporter,
  getIgnoreErrorTypes as readIgnoreErrorTypes,
  setIgnoreErrorTypes as writeIgnoreErrorTypes,
} from './scope';

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
 * Upper bound on errors buffered in one report-once scope before an overflow
 * flush. Caps memory and the crash-loss window for a long-lived boundary that
 * aggregates many failures; the common single-operation boundary never hits it.
 */
const MAX_SCOPE_ERRORS = 100;

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
export class Try<TReturn, TArgs extends readonly unknown[] = unknown[]> {
  private readonly fn: (...args: TArgs) => TReturn;
  private readonly args: TArgs;
  private config: TryConfig<TArgs>;
  private cachedResult?: TryResult<TReturn>;
  private cachedPromise?: Promise<TryResult<TReturn>>;
  private isAsync?: boolean;
  private cachedBreadcrumbData?: Record<string, unknown>;
  private breadcrumbsAdded: boolean = false;
  private scope?: Scope;
  private isBoundary: boolean = false;
  private collected: boolean = false;
  private state: 'pending' | 'executed';

  /**
   * Set the default reporter for all Try instances
   * @param reporter The reporter implementation to use
   */
  static setDefaultReporter(reporter: Reporter): void {
    writeDefaultReporter(reporter);
  }

  /**
   * Get the current default reporter
   */
  static getDefaultReporter(): Reporter {
    return readDefaultReporter();
  }

  /**
   * Install the scope provider used for report-once aggregation. Node/Next.js
   * entries inject an AsyncLocalStorage-backed provider; browser/core leave the
   * default no-op provider (legacy per-terminal reporting).
   */
  static setScopeProvider(provider: ScopeProvider): void {
    writeScopeProvider(provider);
  }

  /**
   * Get the current scope provider.
   */
  static getScopeProvider(): ScopeProvider {
    return readScopeProvider();
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
  constructor(fn: (...args: TArgs) => TReturn, ...args: TArgs) {
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
   * Note: this writes a single realm-global list (shared across all entry
   * bundles via the registry) with last-wins semantics — a later call, in the
   * app or any dependency, replaces the whole list rather than merging. Set it
   * once at startup with the full set of types.
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
    writeIgnoreErrorTypes(ignoreErrorTypes);
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
      | BreadcrumbTransformer<any>,
    ...restTransformers: BreadcrumbTransformer<any>[]
  ): this {
    // Handle variadic transformer functions
    if (typeof configOrFirstTransformer === 'function') {
      const allTransformers = [configOrFirstTransformer, ...restTransformers];
      return this.setConfig({
        breadcrumbConfig:
          allTransformers as unknown as BreadcrumbOptions<TArgs>,
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
   * before any error is re-thrown from {@link unwrap}. It runs synchronously
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
  default<D>(defaultValue: D): Omit<typeof this, 'value'> & {
    value(): IfPromise<
      TReturn,
      Promise<Awaited<TReturn> | D>,
      Awaited<TReturn> | D
    >;
  } {
    type WithGuaranteedValue = Omit<typeof this, 'value'> & {
      value(): IfPromise<
        TReturn,
        Promise<Awaited<TReturn> | D>,
        Awaited<TReturn> | D
      >;
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
  unwrap(): IfPromise<TReturn, Promise<Awaited<TReturn>>, Awaited<TReturn>> {
    const result = this.execute();

    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) =>
        this.settleUnwrap(resolved),
      ) as IfPromise<TReturn, Promise<Awaited<TReturn>>, Awaited<TReturn>>;
    }

    return this.settleUnwrap(result) as IfPromise<
      TReturn,
      Promise<Awaited<TReturn>>,
      Awaited<TReturn>
    >;
  }

  /**
   * Terminal handling shared by `unwrap`'s sync and async paths: run the shared
   * report side effect, then on failure throw the wrapped error (unless the type
   * is configured throw-through) or the original error; on success return the
   * value.
   */
  private settleUnwrap(result: TryResult<TReturn>): Awaited<TReturn> {
    this.runReportSideEffects(result);

    if (!result.success) {
      // `result.error` may be a non-object throw (`null`, `undefined`, a
      // primitive); those carry no usable `name` and can never match the
      // throw-through list, so read the name defensively instead of crashing.
      const errorName =
        result.error !== null && typeof result.error === 'object'
          ? (result.error as { name?: unknown }).name
          : undefined;
      if (
        this.config.message &&
        !(
          typeof errorName === 'string' &&
          readIgnoreErrorTypes().includes(errorName)
        )
      ) {
        throw Try.getDefaultReporter().createWrappedError(
          result.error,
          this.config.message,
        );
      }
      throw result.error;
    }

    return result.value;
  }

  /**
   * The report-or-collect side effect shared by every terminal
   * (`value`/`unwrap`/`error`/`result`). Success settles the collector (flushing
   * at the boundary). Failure routes through the collector when active;
   * otherwise (legacy path) it honors `.report()` / breadcrumbs directly.
   *
   * Consequence: `.report()` alone decides *whether* an error is reported, on
   * every platform and terminal. The platform decides only once-vs-live
   * (collector vs legacy) and the terminal decides only the return shape
   * (throw / value / error / result) — these axes are orthogonal.
   */
  private runReportSideEffects(result: TryResult<TReturn>): void {
    if (result.success) {
      this.collectorSettle(result);
      return;
    }

    if (!this.collectorSettle(result)) {
      if (this.config.message) {
        this.reportError(result.error);
      } else if (this.config.breadcrumbConfig) {
        this.addBreadcrumbsIfConfigured();
      }
    }
  }

  /**
   * Execute the function and return a result object containing either the value or error.
   * This method never throws - it returns a discriminated union that you can pattern match on.
   * A configured `.report()` reports on every platform: the collector path
   * (Node / Next.js) emits one aggregated event for the boundary, the legacy
   * path (browser / bare core / Edge) reports this layer's error directly.
   * Without `.report()`, nothing is reported.
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
        this.runReportSideEffects(resolved);
        return resolved;
      }) as IfPromise<TReturn, Promise<TryResult<TReturn>>, TryResult<TReturn>>;
    }

    this.runReportSideEffects(result);
    return result as IfPromise<
      TReturn,
      Promise<TryResult<TReturn>>,
      TryResult<TReturn>
    >;
  }

  /**
   * Execute the function and return the error if one occurred, or undefined if successful.
   * This method never throws - it returns the error as a value instead.
   * A configured `.report()` reports on every platform: the collector path
   * (Node / Next.js) emits one aggregated event for the boundary, the legacy
   * path (browser / bare core / Edge) reports this layer's error directly.
   * Without `.report()`, nothing is reported.
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
        this.runReportSideEffects(resolved);
        return resolved.success ? undefined : resolved.error;
      }) as IfPromise<TReturn, Promise<Error | undefined>, Error | undefined>;
    }

    this.runReportSideEffects(result);
    return (result.success ? undefined : result.error) as IfPromise<
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
    Promise<Awaited<TReturn> | undefined>,
    Awaited<TReturn> | undefined
  > {
    const result = this.execute();

    if (isPromiseLike<TryResult<TReturn>>(result)) {
      return result.then((resolved) => this.settleValue(resolved)) as IfPromise<
        TReturn,
        Promise<Awaited<TReturn> | undefined>,
        Awaited<TReturn> | undefined
      >;
    }

    return this.settleValue(result) as IfPromise<
      TReturn,
      Promise<Awaited<TReturn> | undefined>,
      Awaited<TReturn> | undefined
    >;
  }

  /**
   * Terminal handling shared by `value`'s sync and async paths: run the shared
   * report side effect, then return the value on success or the configured
   * default on failure (never throws).
   */
  private settleValue(
    result: TryResult<TReturn>,
  ): Awaited<TReturn> | undefined {
    this.runReportSideEffects(result);

    return result.success
      ? (result.value as Awaited<TReturn>)
      : (this.config.defaultValue as Awaited<TReturn> | undefined);
  }

  /**
   * Execute the function and return a result object with success status, value, and error.
   * This is the core execution method that handles both sync and async functions.
   * Results are cached after first execution to avoid re-running the function.
   *
   * @returns Promise resolving to a result object indicating success/failure
   */
  private execute(): TryResult<TReturn> | Promise<TryResult<TReturn>> {
    if (this.state === 'executed' && this.cachedResult) {
      return this.isAsync
        ? (this.cachedPromise as Promise<TryResult<TReturn>>)
        : this.cachedResult;
    }

    if (this.cachedPromise) {
      return this.cachedPromise;
    }

    const provider = Try.getScopeProvider();
    try {
      if (provider.collects) {
        const store = provider.getStore();
        // An already-flushed store is a dead scope (e.g. a callback scheduled
        // inside a boundary firing after that boundary settled): treat it as
        // absent so this Try opens a fresh boundary instead of lateEmit-ing
        // every layer separately.
        this.isBoundary = store === undefined || store.flushed;
        this.scope = this.isBoundary ? { errors: [], flushed: false } : store;
      }
    } catch {
      // A custom ScopeProvider that throws from `collects`/`getStore` must not
      // break the never-throw contract: fall back to the legacy (no-aggregation)
      // path. (Stock ALS never throws here.)
      this.scope = undefined;
      this.isBoundary = false;
    }

    try {
      const value =
        this.scope && this.isBoundary
          ? provider.run(this.scope, () => this.fn(...this.args))
          : this.fn(...this.args);

      if (isPromiseLike<Awaited<TReturn>>(value)) {
        this.isAsync = true;
        this.cachedPromise = Promise.resolve(value)
          .then((resolved) => {
            this.cachedResult = {
              success: true,
              value: resolved as Awaited<TReturn>,
            };
            return this.cachedResult;
          })
          .catch((e) => {
            if (this.config.debug) {
              console.error(e);
            }
            const error = e as Error;
            this.cachedResult = { success: false, error };
            return this.cachedResult;
          })
          .finally(() => {
            this.state = 'executed';
            return this.runFinallyCallback();
          });

        return this.cachedPromise;
      }

      this.isAsync = false;
      this.cachedResult = {
        success: true,
        value: value as Awaited<TReturn>,
      };
    } catch (e) {
      if (this.config.debug) {
        console.error(e);
      }
      const error = e as Error;
      this.isAsync = false;
      this.cachedResult = { success: false, error };
    } finally {
      this.state = 'executed';
      if (!this.isAsync) {
        this.runFinallyCallback();
      }
    }

    return this.cachedResult;
  }

  private runFinallyCallback(): void | Promise<void> {
    if (!this.config.finallyCallback) {
      return;
    }

    try {
      const result = this.config.finallyCallback();
      if (isPromiseLike(result)) {
        return Promise.resolve(result).catch((err) => {
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
   * The wrapped function's name, normalized to `'anonymous'` for unnamed
   * functions. Single source of truth so legacy and collector paths label
   * breadcrumbs identically (an empty `fn.name` never reaches a reporter).
   */
  private get functionName(): string {
    return this.fn.name || 'anonymous';
  }

  /**
   * Report error using the configured reporter with context.
   */
  private reportError(error: Error): void {
    this.addBreadcrumbsIfConfigured();

    Try.getDefaultReporter().report(error, {
      message: this.config.message,
      tags: this.config.tags,
      breadcrumbData: this.cachedBreadcrumbData,
      functionName: this.functionName,
    });
  }

  /**
   * Add breadcrumbs using the configured reporter if configured.
   */
  private addBreadcrumbsIfConfigured(): void {
    if (!this.config.breadcrumbConfig || this.breadcrumbsAdded) {
      return;
    }

    // Compute breadcrumb data once (the `breadcrumbsAdded` guard above ensures
    // this method body runs at most once per instance).
    this.cachedBreadcrumbData = this.extractAllBreadcrumbData();

    Try.getDefaultReporter().addBreadcrumbs(
      this.cachedBreadcrumbData,
      this.functionName,
    );
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
   * Collector-path side effects on settle: collect this layer's error (once,
   * gated on `.report()`/breadcrumbs) and, at the boundary, flush the scope.
   * Returns `true` when the collector path is active, so callers skip the
   * legacy live-report side effect.
   */
  private collectorSettle(result: TryResult<TReturn>): boolean {
    const scope = this.scope;
    if (!scope) {
      return false;
    }
    if (scope.flushed) {
      // Scope already emitted. A nested Try settling now (fire-and-forget or
      // otherwise detached) acts as its own boundary rather than appending to a
      // dead scope.
      if (!result.success && !this.collected) {
        this.lateEmit(result.error);
      }
      return true;
    }
    if (!result.success) {
      this.collectError(scope, result.error);
    }
    if (this.isBoundary) {
      this.flushScope(scope);
    }
    return true;
  }

  /**
   * Emit a nested Try's own error directly when it settled after its boundary
   * already flushed. Bounds the fire-and-forget limitation to "may emit
   * separately" rather than "silently lost".
   */
  private lateEmit(error: Error): void {
    this.collected = true;
    if (!this.config.message) {
      return; // breadcrumb-only late arrival → nothing to emit
    }
    if (this.config.debug) {
      console.warn(
        'report-once: nested Try settled after the boundary flushed; emitting separately',
      );
    }
    this.emitGroup([this.buildEntry(error)]);
  }

  /**
   * Assemble this layer's {@link Collected} contribution. `message` is included
   * verbatim from config (`undefined` for a breadcrumb-only layer, which
   * downstream treats as "no cause node").
   */
  private buildEntry(error: Error): Collected {
    return {
      error,
      message: this.config.message,
      tags: this.config.tags,
      breadcrumbData: this.collectBreadcrumbData(),
      functionName: this.functionName,
    };
  }

  /**
   * Append this layer's contribution to the scope, once per instance. A layer
   * with a `.report()` message contributes a cause node; a breadcrumb-only
   * layer contributes breadcrumbs that attach iff its root's event fires.
   */
  private collectError(scope: Scope, error: Error): void {
    if (this.collected) {
      return;
    }
    if (this.config.message || this.config.breadcrumbConfig) {
      scope.errors.push(this.buildEntry(error));
      this.collected = true;
      // Bound memory (and the crash-loss window) for a long-lived boundary that
      // aggregates many failures: flush early once the buffer fills, keeping the
      // scope alive so it keeps collecting. Tradeoff: a root that spans an
      // overflow boundary can emit in more than one batch — acceptable under
      // pathological volume; the common single-operation case never reaches the
      // cap. Long-lived/streaming work should not be a single boundary `Try`.
      if (scope.errors.length >= MAX_SCOPE_ERRORS) {
        this.emitScope(scope);
      }
    }
  }

  private collectBreadcrumbData(): Record<string, unknown> | undefined {
    return this.config.breadcrumbConfig
      ? this.extractAllBreadcrumbData()
      : undefined;
  }

  /**
   * Flush the boundary scope: emit everything buffered, then mark the scope
   * flushed so any later settle routes to {@link lateEmit}. Called exactly once
   * per scope — {@link collectorSettle} is the sole caller.
   */
  private flushScope(scope: Scope): void {
    scope.flushed = true;
    this.emitScope(scope);
  }

  /**
   * Emit one event per distinct root failure currently buffered, then clear the
   * buffer. Shared by the boundary flush ({@link flushScope}) and the overflow
   * flush in {@link collectError}; the overflow caller leaves `scope.flushed`
   * false so the scope keeps collecting after the batch.
   */
  private emitScope(scope: Scope): void {
    if (scope.errors.length === 0) {
      return;
    }

    // Grouping and assembly read hostile-controllable error properties; a
    // throw here must neither escape (never-throw contract) nor leave the
    // buffer dirty (every later terminal would re-throw the stale batch). One
    // malformed group must not prevent the remaining groups from emitting.
    try {
      for (const group of this.groupByRoot(scope.errors)) {
        try {
          if (group.some((entry) => entry.message)) {
            this.emitGroup(group);
          }
        } catch (err) {
          if (this.config.debug) {
            console.error('Error in report-once flush', err);
          }
        }
      }
    } catch (err) {
      if (this.config.debug) {
        console.error('Error in report-once flush', err);
      }
    } finally {
      scope.errors.length = 0;
    }
  }

  /**
   * Walk an error's `.cause` chain to its deepest `Error` (the root), with a
   * cycle guard. Tolerates non-object throws (`null`, `undefined`, strings,
   * numbers, POJOs) by returning them unchanged. Used only as a de-dup key —
   * the emitted leaf is still the innermost collected error.
   */
  private rootOf(error: unknown): unknown {
    const seen = new Set<unknown>();
    let current: unknown = error;
    while (current != null && typeof current === 'object') {
      let cause: unknown;
      try {
        cause = (current as { cause?: unknown }).cause;
      } catch {
        // A hostile `cause` getter must not break the never-throw contract:
        // treat the current node as the root and stop walking.
        break;
      }
      if (!(cause instanceof Error) || seen.has(current)) {
        break;
      }
      seen.add(current);
      current = cause;
    }
    return current;
  }

  /**
   * Group collected entries by their root failure's identity so each distinct
   * root becomes one event. Real `Error`s and non-`Error` throws alike key by
   * identity (`Map` value equality), so independent failures never merge.
   * Entry order within a group is preserved (innermost first); groups are
   * returned in first-seen order.
   *
   * Caveat: identity keying means two genuinely independent failures that reuse
   * the *same* `Error` instance as their root (e.g. a cached/singleton error
   * object observed by two operations) merge into one event — non-leaf entries'
   * identity (stack, own props) is then discarded and only their `.message`
   * survives in the assembled chain. Throwing fresh errors avoids this.
   */
  private groupByRoot(entries: Collected[]): Collected[][] {
    const groups: Collected[][] = [];
    const byRoot = new Map<unknown, Collected[]>();
    for (const entry of entries) {
      const root = this.rootOf(entry.error);
      // Only object roots dedup by identity. Primitive/null/undefined throws
      // carry no identity, so two independent failures that happen to throw the
      // same primitive value (`throw 'boom'`, `NaN`, …) must NOT merge — give
      // each its own group rather than collapsing them on Map value-equality.
      if (root === null || typeof root !== 'object') {
        groups.push([entry]);
        continue;
      }
      let group = byRoot.get(root);
      if (!group) {
        group = [];
        byRoot.set(root, group);
        groups.push(group);
      }
      group.push(entry);
    }
    return groups;
  }

  /**
   * Assemble one event from a group of collected entries (innermost first) and
   * hand it to the reporter.
   */
  private emitGroup(entries: Collected[]): void {
    const messages = entries
      .filter((entry) => entry.message)
      .map((entry) => entry.message as string)
      .reverse();

    const leaf = entries[0].error;
    const assembled = this.buildCauseChain(messages, leaf);
    const tags = entries.reduce<Record<string, string>>(
      (acc, entry) => ({ ...acc, ...entry.tags }),
      {},
    );
    const breadcrumbs = entries
      .filter(
        (entry) =>
          entry.breadcrumbData && Object.keys(entry.breadcrumbData).length > 0,
      )
      .map((entry) => ({
        data: entry.breadcrumbData as Record<string, unknown>,
        functionName: entry.functionName,
      }));

    const reporter = Try.getDefaultReporter();
    try {
      let outcome: unknown;
      if (reporter.capture) {
        outcome = reporter.capture(assembled, {
          tags,
          breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
        });
      } else {
        outcome = reporter.report(leaf, {
          message: messages[0],
          tags,
          breadcrumbData: entries[0].breadcrumbData,
          functionName: entries[0].functionName,
        });
      }
      // A structurally-valid async reporter returns a promise; a rejection
      // must not escape as an unhandledRejection after the terminal settled.
      if (isPromiseLike(outcome)) {
        Promise.resolve(outcome).catch((err) => {
          if (this.config.debug) {
            console.error('Error in report-once flush', err);
          }
        });
      }
    } catch (err) {
      if (this.config.debug) {
        console.error('Error in report-once flush', err);
      }
    }
  }

  /**
   * Build a nested-cause chain `messages[0]` (outermost) → … → `leaf`. Each
   * wrapper copies the leaf's stack (when the leaf is an object with one) so
   * `Try`/assembly frames never appear. Tolerates a non-object leaf.
   */
  private buildCauseChain(messages: string[], leaf: unknown): Error {
    let leafStack: string | undefined;
    if (leaf != null && typeof leaf === 'object') {
      try {
        leafStack = (leaf as { stack?: string }).stack;
      } catch {
        // A hostile `stack` getter must not break the never-throw contract:
        // assemble the chain without copying the leaf's stack.
        leafStack = undefined;
      }
    }
    let current: unknown = leaf;
    for (let i = messages.length - 1; i >= 0; i--) {
      const wrapper = new Error(messages[i]);
      wrapper.cause = current;
      if (leafStack !== undefined) {
        wrapper.stack = leafStack;
      }
      current = wrapper;
    }
    return current as Error;
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
  then<TResult1 = Awaited<TReturn> | undefined, TResult2 = never>(
    onfulfilled?:
      | ((
          value: Awaited<TReturn> | undefined,
        ) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(
      this.value() as
        | Awaited<TReturn>
        | undefined
        | PromiseLike<Awaited<TReturn> | undefined>,
    ).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}
