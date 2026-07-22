import type { BreadcrumbTransformer } from './types';
import { BreadcrumbTransformationError } from './types';
import { normalizeThrown } from './normalize';

/**
 * Predefined transformer functions for common use cases
 */
export const PredefinedTransformers = {
  /**
   * Extract length of strings, arrays, or object keys
   */
  length: (value: unknown, paramIndex: number): Record<string, unknown> => {
    const paramKey = `param${paramIndex}`;

    if (typeof value === 'string' || Array.isArray(value)) {
      return { [`${paramKey}_length`]: value.length };
    } else if (value && typeof value === 'object') {
      return { [`${paramKey}_length`]: Object.keys(value).length };
    }

    return {};
  },

  /**
   * Get the type of the value
   */
  type: (value: unknown, paramIndex: number): Record<string, unknown> => {
    const paramKey = `param${paramIndex}`;
    return { [`${paramKey}_type`]: typeof value };
  },

  /**
   * Include the raw value
   */
  value: (value: unknown, paramIndex: number): Record<string, unknown> => {
    const paramKey = `param${paramIndex}`;
    return { [`${paramKey}_value`]: value };
  },

  /**
   * Convert value to string representation
   */
  toString: (value: unknown, paramIndex: number): Record<string, unknown> => {
    const paramKey = `param${paramIndex}`;
    return { [`${paramKey}_string`]: String(value) };
  },
} as const;

/**
 * Registry for managing breadcrumb transformers
 */
export class TransformerRegistry {
  /**
   * Apply a custom transformer function safely
   */
  static apply(
    transformer: BreadcrumbTransformer<unknown>,
    value: unknown,
    debug = false,
  ): Record<string, unknown> {
    try {
      return transformer(value);
    } catch (error) {
      const transformationError = new BreadcrumbTransformationError(
        normalizeThrown(error),
        'custom',
      );

      // Always warn: a thrown transformer yields empty data, which trips the
      // guard in addBreadcrumbsIfConfigured and silently drops the breadcrumb.
      console.warn(
        '[try-catch] breadcrumb transformer threw; breadcrumb dropped:',
        transformationError,
      );
      if (debug) {
        console.error('Error in breadcrumb transformer:', transformationError);
      }

      return {};
    }
  }

  /**
   * Apply a predefined transformer by type
   */
  static applyPredefined(
    transformerType: 'length' | 'type' | 'value' | 'toString',
    value: unknown,
    paramIndex: number,
    debug = false,
  ): Record<string, unknown> {
    try {
      const transformer = PredefinedTransformers[transformerType];
      return transformer(value, paramIndex);
    } catch (error) {
      const transformationError = new BreadcrumbTransformationError(
        normalizeThrown(error),
        transformerType,
        paramIndex,
      );

      console.warn(
        '[try-catch] predefined breadcrumb transformer threw; breadcrumb dropped:',
        transformationError,
      );
      if (debug) {
        console.error('Error in predefined transformer:', transformationError);
      }

      return {};
    }
  }

  /**
   * Validate that a parameter index is valid for the given arguments
   */
  static validateParameterIndex(
    paramIndex: number,
    argsLength: number,
  ): boolean {
    return paramIndex >= 0 && paramIndex < argsLength;
  }
}
