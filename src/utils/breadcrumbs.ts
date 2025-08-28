import type {
  BreadcrumbOptions,
  BreadcrumbExtractor,
  BreadcrumbConfig,
  BreadcrumbTransformer,
} from './types';
import { TransformerRegistry } from './transformers';

/**
 * Utility class for extracting breadcrumb data from function arguments
 * using various configuration formats
 */
export class BreadcrumbExtractorUtil {
  /**
   * Extract breadcrumb data from arguments using flexible configuration
   */
  static extract<TArgs extends readonly unknown[]>(
    config: BreadcrumbOptions<TArgs>,
    args: TArgs,
    debug = false,
  ): Record<string, unknown> {
    let breadcrumbData: Record<string, unknown> = {};

    // Array of keys from first parameter
    if (this.isStringArray(config)) {
      const firstArg = args[0];
      if (firstArg && typeof firstArg === 'object') {
        breadcrumbData = this.extractFromKeys(
          firstArg,
          config as readonly (keyof TArgs[0])[],
        );
      }
    }
    // Handle transformer function array (variadic syntax)
    else if (this.isTransformerArray(config)) {
      const transformers =
        config as unknown as readonly BreadcrumbTransformer<any>[];
      transformers.forEach((transformer, index) => {
        if (index < args.length) {
          const transformed = TransformerRegistry.apply(
            transformer,
            args[index],
            debug,
          );
          breadcrumbData = { ...breadcrumbData, ...transformed };
        }
      });
    }
    // Handle array syntax: positional entries or extractor objects
    else if (Array.isArray(config)) {
      breadcrumbData = this.extractFromArray(config, args, debug);
    }
    // Handle object syntax
    else if (typeof config === 'object') {
      breadcrumbData = this.extractFromObject(
        config as BreadcrumbConfig<TArgs>,
        args,
        debug,
      );
    }

    return breadcrumbData;
  }

  /**
   * Extract breadcrumb data from object using specified keys
   */
  static extractFromKeys(
    obj: any,
    keys: readonly (keyof any)[],
  ): Record<string, unknown> {
    const breadcrumbData: Record<string, unknown> = {};

    keys.forEach((key) => {
      const value = obj[key];
      if (value !== undefined) {
        breadcrumbData[key as string] = value;
      }
    });

    return breadcrumbData;
  }

  /**
   * Extract breadcrumb data from a parameter using extractor configuration
   */
  static extractFromParameter<TArgs extends readonly unknown[]>(
    extractor: BreadcrumbExtractor<TArgs>,
    args: TArgs,
    debug = false,
  ): Record<string, unknown> {
    if (
      !TransformerRegistry.validateParameterIndex(extractor.param, args.length)
    ) {
      return {};
    }

    const paramValue = args[extractor.param];

    if ('keys' in extractor) {
      // Extract specific keys from object
      if (paramValue && typeof paramValue === 'object') {
        return this.extractFromKeys(paramValue, extractor.keys);
      }
    } else if ('transform' in extractor) {
      // Apply custom transformer
      return TransformerRegistry.apply(extractor.transform, paramValue, debug);
    } else if ('as' in extractor) {
      // Apply predefined transformer
      return TransformerRegistry.applyPredefined(
        extractor.as,
        paramValue,
        extractor.param,
        debug,
      );
    }

    return {};
  }

  /**
   * Check if config is an array (string keys only)
   */
  private static isStringArray(config: unknown): boolean {
    return (
      Array.isArray(config) &&
      config.length > 0 &&
      config.every((el) => typeof el === 'string')
    );
  }

  /**
   * Check if config is a transformer function array
   */
  private static isTransformerArray(config: unknown): boolean {
    return (
      Array.isArray(config) &&
      config.length > 0 &&
      config.every((el) => typeof el === 'function')
    );
  }

  /**
   * Extract breadcrumb data from array configuration
   */
  private static extractFromArray<TArgs extends readonly unknown[]>(
    config: readonly (
      | string
      | readonly string[]
      | BreadcrumbExtractor<TArgs>
    )[],
    args: TArgs,
    debug: boolean,
  ): Record<string, unknown> {
    let breadcrumbData: Record<string, unknown> = {};

    config.forEach((entry, index) => {
      // If entry is a plain extractor object with its own param index, use existing logic
      if (typeof entry === 'object' && !Array.isArray(entry)) {
        const paramData = this.extractFromParameter(
          entry as BreadcrumbExtractor<TArgs>,
          args,
          debug,
        );
        breadcrumbData = { ...breadcrumbData, ...paramData };
        return;
      }

      // Positional syntax handling
      const arg = args[index];
      if (typeof entry === 'string') {
        // Map value directly under the provided key
        breadcrumbData = { ...breadcrumbData, [entry]: arg };
      } else if (Array.isArray(entry)) {
        // Extract listed keys from an object argument
        if (arg && typeof arg === 'object') {
          const data = this.extractFromKeys(arg, entry);
          breadcrumbData = { ...breadcrumbData, ...data };
        }
      }
    });

    return breadcrumbData;
  }

  /**
   * Extract breadcrumb data from object configuration
   */
  private static extractFromObject<TArgs extends readonly unknown[]>(
    config: BreadcrumbConfig<TArgs>,
    args: TArgs,
    debug: boolean,
  ): Record<string, unknown> {
    let breadcrumbData: Record<string, unknown> = {};

    for (const [paramIndex, paramConfig] of Object.entries(config)) {
      const index = parseInt(paramIndex, 10);
      if (TransformerRegistry.validateParameterIndex(index, args.length)) {
        const paramData = this.extractFromParameterConfig(
          index,
          paramConfig!,
          args,
          debug,
        );
        breadcrumbData = { ...breadcrumbData, ...paramData };
      }
    }

    return breadcrumbData;
  }

  /**
   * Extract breadcrumb data from parameter using object-style configuration
   */
  private static extractFromParameterConfig<TArgs extends readonly unknown[]>(
    paramIndex: number,
    config: readonly (keyof any)[] | BreadcrumbTransformer<any>,
    args: TArgs,
    debug: boolean,
  ): Record<string, unknown> {
    const paramValue = args[paramIndex];

    if (Array.isArray(config)) {
      // Extract keys from object
      if (paramValue && typeof paramValue === 'object') {
        return this.extractFromKeys(paramValue, config);
      }
    } else if (typeof config === 'function') {
      // Apply transformer function
      return TransformerRegistry.apply(config, paramValue, debug);
    }

    return {};
  }
}
