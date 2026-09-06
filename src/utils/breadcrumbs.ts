import type {
  BreadcrumbOptions,
  BreadcrumbExtractor,
  BreadcrumbConfig,
  BreadcrumbTransformer,
} from './types.js';
import { TransformerRegistry } from './transformers.js';

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
    // Array of keys from first parameter
    if (BreadcrumbExtractorUtil.isStringArray(config)) {
      return BreadcrumbExtractorUtil.extractFromKeysIfObject(
        args[0],
        config,
        debug,
      );
    }
    // Handle transformer function array (variadic syntax)
    if (BreadcrumbExtractorUtil.isTransformerArray(config)) {
      let breadcrumbData: Record<string, unknown> = {};
      config.forEach((transformer, index) => {
        if (index < args.length) {
          breadcrumbData = {
            ...breadcrumbData,
            ...TransformerRegistry.apply(transformer, args[index], debug),
          };
        }
      });
      return breadcrumbData;
    }
    // Handle array syntax: positional entries or extractor objects
    if (Array.isArray(config)) {
      return BreadcrumbExtractorUtil.extractFromArray(config, args, debug);
    }
    // Handle object syntax
    if (typeof config === 'object') {
      return BreadcrumbExtractorUtil.extractFromObject(
        config as BreadcrumbConfig<TArgs>,
        args,
        debug,
      );
    }
    return {};
  }

  /**
   * Extract breadcrumb data from object using specified keys.
   * A key whose read throws (a throwing getter, a Proxy trap) is skipped and
   * logged under `debug`, so the terminal methods keep their never-throw
   * contract and the other keys are still recorded.
   */
  static extractFromKeys(
    obj: Record<PropertyKey, unknown>,
    keys: readonly PropertyKey[],
    debug = false,
  ): Record<string, unknown> {
    const breadcrumbData: Record<string, unknown> = {};

    keys.forEach((key) => {
      let value: unknown;
      try {
        value = obj[key];
      } catch (error) {
        if (debug) {
          console.error('Error reading breadcrumb key:', key, error);
        }
        return;
      }
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
      return this.extractFromKeysIfObject(paramValue, extractor.keys, debug);
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

  private static isStringArray(config: unknown): config is readonly string[] {
    return this.isUniformArray(config, 'string');
  }

  private static isTransformerArray(
    config: unknown,
  ): config is readonly BreadcrumbTransformer<unknown>[] {
    return this.isUniformArray(config, 'function');
  }

  /**
   * True for a non-empty array whose every element has the given `typeof`.
   */
  private static isUniformArray(config: unknown, kind: string): boolean {
    return (
      Array.isArray(config) &&
      config.length > 0 &&
      config.every((el) => typeof el === kind)
    );
  }

  /**
   * Extract keys from `value` when it is an object; `{}` for primitives and
   * `null`, which carry no keys.
   */
  private static extractFromKeysIfObject(
    value: unknown,
    keys: readonly PropertyKey[],
    debug: boolean,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return this.extractFromKeys(
      value as Record<PropertyKey, unknown>,
      keys,
      debug,
    );
  }

  /**
   * Extract breadcrumb data from array configuration
   */
  private static extractFromArray<TArgs extends readonly unknown[]>(
    config: readonly (
      string | readonly string[] | BreadcrumbExtractor<TArgs>
    )[],
    args: TArgs,
    debug: boolean,
  ): Record<string, unknown> {
    let breadcrumbData: Record<string, unknown> = {};

    config.forEach((entry, index) => {
      // If entry is a plain extractor object with its own param index, use existing logic
      if (typeof entry === 'object' && !Array.isArray(entry)) {
        breadcrumbData = {
          ...breadcrumbData,
          ...this.extractFromParameter(
            entry as BreadcrumbExtractor<TArgs>,
            args,
            debug,
          ),
        };
        return;
      }

      // Positional syntax handling
      const arg = args[index];
      if (typeof entry === 'string') {
        // Map value directly under the provided key; drop undefined
        // to match `extractFromKeys` semantics.
        if (arg !== undefined) {
          breadcrumbData = { ...breadcrumbData, [entry]: arg };
        }
      } else if (Array.isArray(entry)) {
        // Extract listed keys from an object argument
        breadcrumbData = {
          ...breadcrumbData,
          ...this.extractFromKeysIfObject(arg, entry, debug),
        };
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
      if (
        paramConfig !== undefined &&
        TransformerRegistry.validateParameterIndex(index, args.length)
      ) {
        breadcrumbData = {
          ...breadcrumbData,
          ...this.extractFromParameterConfig(index, paramConfig, args, debug),
        };
      }
    }

    return breadcrumbData;
  }

  /**
   * Extract breadcrumb data from parameter using object-style configuration
   */
  private static extractFromParameterConfig<TArgs extends readonly unknown[]>(
    paramIndex: number,
    config: readonly PropertyKey[] | BreadcrumbTransformer<unknown>,
    args: TArgs,
    debug: boolean,
  ): Record<string, unknown> {
    const paramValue = args[paramIndex];

    if (Array.isArray(config)) {
      // Extract keys from object
      return this.extractFromKeysIfObject(paramValue, config, debug);
    } else if (typeof config === 'function') {
      // Apply transformer function
      return TransformerRegistry.apply(config, paramValue, debug);
    }

    return {};
  }
}
