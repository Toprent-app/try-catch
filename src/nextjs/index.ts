import * as Sentry from '@sentry/nextjs';

/**
 * Configuration for Try execution
 */
interface TryConfig<TArg extends Record<string, any>> {
  readonly message?: string;
  readonly breadcrumbKeys?: readonly (keyof TArg)[];
  readonly tags: Readonly<Record<string, string>>;
  readonly defaultValue?: unknown;
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
   * Create a new Try instance with updated configuration
   */
  private setConfig(newConfig: Partial<TryConfig<TArgs[0]>>): Try<T, TArgs> {
    this.config = { ...this.config, ...newConfig };
    return this;
  }

  /**
   * Attach a custom Sentry error message.
   */
  report(message: string): Try<T, TArgs> {
    return this.setConfig({ message });
  }

  /**
   * Record breadcrumbs for the provided parameter keys.
   * Only works when the first argument is an object – useful for most cases.
   */
  breadcrumbs(keys: readonly (keyof TArgs[0])[]): Try<T, TArgs> {
    return this.setConfig({ breadcrumbKeys: keys });
  }

  /**
   * Add a tag for Sentry error reporting.
   */
  tag(name: string, value: string): Try<T, TArgs> {
    return this.setConfig({
      tags: { ...this.config.tags, [name]: value }
    });
  }

  /**
   * Set default value
   */
  default<Return>(defaultValue: Return): Try<T, TArgs> {
    return this.setConfig({ defaultValue });
  }

  /**
   * Execute the function and return the result, or throw if there was an error.
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
      if (this.config.message) {
        throw new Error(this.config.message);
      }
      throw result.error;
    }

    return result.value;
  }

  /**
   * Execute the function and return the error if one occurred, or undefined if successful.
   */
  async error(): Promise<Error | undefined> {
    const result = await this.execute();
    return result.success ? undefined : result.error;
  }

  /**
   * Execute the function and return the value if successful, or undefined if there was an error.
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
   */
  private async execute(): Promise<TryResult<T>> {
    if (this.state === 'executed' && this.result) {
      return this.result;
    }

    try {
      const value = await this.fn(...this.args);
      return { success: true, value };
    } catch (e) {
      console.error(e);
      const error = e as Error;
      return { success: false, error };
    } finally {
      this.state = 'executed';
    }
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
   * Make the Try instance thenable so it can be `await`-ed directly. This executes
   * the underlying function with the current configuration and resolves with the
   * same result as calling `.value()`.
   */
  then<TResult1 = Awaited<T> | undefined, TResult2 = never>(
    onfulfilled?: ((value: Awaited<T> | undefined) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.value().then(onfulfilled as any, onrejected as any);
  }
}

export default Try; 
