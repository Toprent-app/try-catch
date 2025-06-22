import * as Sentry from '@sentry/nextjs';

/**
 * Configuration for Try execution
 */
interface TryConfig {
  readonly message?: string;
  readonly breadcrumbKeys?: readonly string[];
  readonly tags: Readonly<Record<string, string>>;
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
export class Try<T, TArgs extends readonly unknown[] = unknown[]> {
  private readonly fn: (...args: TArgs) => T | Promise<T>;
  private readonly args: TArgs;
  private readonly config: TryConfig;

  constructor(
    fn: (...args: TArgs) => T | Promise<T>,
    ...args: TArgs
  ) {
    this.fn = fn;
    this.args = args;
    this.config = { tags: {} };
  }

  /**
   * Create a new Try instance with updated configuration
   */
  private withConfig(newConfig: Partial<TryConfig>): Try<T, TArgs> {
    const instance = Object.create(Try.prototype) as Try<T, TArgs>;
    (instance as any).fn = this.fn;
    (instance as any).args = this.args;
    (instance as any).config = { ...this.config, ...newConfig };
    return instance;
  }

  /**
   * Attach a custom Sentry error message.
   */
  report(message: string): Try<T, TArgs> {
    return this.withConfig({ message });
  }

  /**
   * Record breadcrumbs for the provided parameter keys.
   * Only works when the first argument is an object – useful for most cases.
   */
  breadcrumbs(keys: readonly string[]): Try<T, TArgs> {
    return this.withConfig({ breadcrumbKeys: keys });
  }

  /**
   * Add a tag for Sentry error reporting.
   */
  tag(name: string, value: string): Try<T, TArgs> {
    return this.withConfig({
      tags: { ...this.config.tags, [name]: value }
    });
  }

  /**
   * Configure to re-throw the exception after reporting to Sentry.
   * Returns this for chaining with .unwrap().
   */
  rethrow(): this {
    // This method exists for API compatibility and chaining
    // The rethrow behavior is handled in unwrap()
    return this;
  }

  /**
   * Execute and return a default value when an exception occurs.
   */
  async default<Return>(defaultValue: Return): Promise<Awaited<T> | Return> {
    const result = await this.execute();
    return result.success ? result.value! : defaultValue;
  }

  /**
   * Execute the function and return the result, or throw if there was an error.
   */
  async unwrap(): Promise<Awaited<T>> {
    const result = await this.execute();

    if (!result.success) {
      throw result.error!;
    }

    return result.value!;
  }

  /**
   * Execute the function and return the error if one occurred, or undefined if successful.
   */
  async error(): Promise<Error | undefined> {
    const result = await this.execute();
    return result.success ? undefined : result.error;
  }

  /**
   * Execute the function and return a result object with success status, value, and error.
   */
  private async execute(): Promise<TryResult<T>> {
    try {
      const value = await this.fn(...this.args);
      return { success: true, value };
    } catch (error) {
      const capturedError = error as Error;
      this.reportError(capturedError);
      return { success: false, error: capturedError };
    }
  }

  /**
   * Report error to Sentry with configured context.
   */
  private reportError(error: Error): void {
    this.addBreadcrumbsIfConfigured();

    const wrappedError = this.createWrappedError(error);
    wrappedError.stack = error.stack;
    const sentryTags = { ...this.config.tags, library: '@power-rent/try-catch' };

    Sentry.captureException(wrappedError, { tags: sentryTags });
  }

  /**
   * Add breadcrumbs to Sentry if configured.
   */
  private addBreadcrumbsIfConfigured(): void {
    if (!this.config.breadcrumbKeys?.length) {
      return;
    }

    const firstArg = this.args[0] as Record<string, unknown> | undefined;
    if (!firstArg || typeof firstArg !== 'object') {
      return;
    }

    const breadcrumbData = this.extractBreadcrumbData(firstArg);
    Sentry.addBreadcrumb({ data: breadcrumbData });
  }

  /**
   * Extract breadcrumb data from the first argument using configured keys.
   */
  private extractBreadcrumbData(firstArg: Record<string, unknown>): Record<string, unknown> {
    const breadcrumbData: Record<string, unknown> = {};

    this.config.breadcrumbKeys!.forEach((key) => {
      breadcrumbData[key] = firstArg[key];
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
}

export default Try; 
