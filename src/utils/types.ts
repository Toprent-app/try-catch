/**
 * Shared type definitions for breadcrumb system
 */

/**
 * Breadcrumb transformation function type
 */
export type BreadcrumbTransformer<T> = (value: T) => Record<string, unknown>;

/**
 * Utility type that validates keys exist on the first parameter type.
 * Returns the key array type if valid, or never if any key is invalid.
 */
export type ValidateKeys<
  TArgs extends readonly unknown[],
  Keys extends readonly string[]
> = TArgs[0] extends Record<string, any>
  ? Keys extends readonly (keyof TArgs[0])[]
  ? Keys
  : never
  : never;

/**
 * Utility type that creates a variadic tuple of breadcrumb transformers.
 * Each transformer corresponds to the parameter at the same position and receives the correct type.
 * Supports partial application - you can provide fewer transformers than parameters.
 *
 * @example
 * For a function `(s: string, n: number, b: boolean) => void`
 * This creates: `[BreadcrumbTransformer<string>?, BreadcrumbTransformer<number>?, BreadcrumbTransformer<boolean>?]`
 */
export type VariadicBreadcrumbTransformers<TArgs extends readonly unknown[]> =
  TArgs extends readonly [infer First, ...infer Rest]
  ? readonly [BreadcrumbTransformer<First>?, ...VariadicBreadcrumbTransformers<Rest>]
  : readonly [];

/**
 * Breadcrumb extractor configuration for array syntax
 */
export type BreadcrumbExtractor<TArgs extends readonly unknown[]> =
  | {
    // Extract from object parameters by key
    readonly param: number;
    readonly keys: readonly string[];
  }
  | {
    // Transform any parameter to breadcrumbs
    readonly param: number;
    readonly transform: BreadcrumbTransformer<unknown>;
  }
  | {
    // Predefined transformer for common types
    readonly param: number;
    readonly as: 'length' | 'type' | 'value' | 'toString';
  };

// Positional breadcrumb syntax where each entry corresponds to the argument position
// - string => maps the argument value to the given breadcrumb key
// - BreadcrumbExtractor => advanced per-entry extractor (still supported)
// Note: string[] is intentionally excluded here to force key validation through ValidateKeys
export type PositionalBreadcrumbs<TArgs extends readonly unknown[]> = readonly (
  | string
  | BreadcrumbExtractor<TArgs>
)[];

/**
 * Object-style breadcrumb configuration
 */
export type BreadcrumbConfig<TArgs extends readonly unknown[]> = {
  readonly [K in number | string]?:
  | readonly string[]
  | BreadcrumbTransformer<unknown>;
};

/**
 * Union type for all breadcrumb configuration options
 * Note: string[] arrays are intentionally excluded to force validation through ValidateKeys
 */
export type BreadcrumbOptions<TArgs extends readonly unknown[]> =
  | readonly BreadcrumbExtractor<TArgs>[] // Array syntax (extractors with explicit param)
  | BreadcrumbConfig<TArgs> // Object syntax (map param index -> extractor)
  | PositionalBreadcrumbs<TArgs>; // Positional array syntax (no string[] to force ValidateKeys)

/**
 * Error thrown when breadcrumb transformation fails
 */
export class BreadcrumbTransformationError extends Error {
  constructor(
    public readonly originalError: Error,
    public readonly transformerType: string,
    public readonly paramIndex?: number,
  ) {
    super(`Breadcrumb transformation failed (${transformerType}): ${originalError.message}`);
    this.name = 'BreadcrumbTransformationError';
  }
}
