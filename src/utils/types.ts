/**
 * Shared type definitions for breadcrumb system
 */

/**
 * Breadcrumb transformation function type
 */
export type BreadcrumbTransformer<T> = (value: T) => Record<string, unknown>;

type ExtractStringKeys<T> =
  T extends Record<string, any> ? Extract<keyof T, string> : never;

type KeyArrayFor<T> =
  ExtractStringKeys<T> extends never ? never : readonly ExtractStringKeys<T>[];

type BreadcrumbConfigEntry<T> = KeyArrayFor<T> | BreadcrumbTransformer<T>;

type IsTuple<T extends readonly unknown[]> = number extends T['length']
  ? false
  : true;

type BreadcrumbConfigTuple<
  TArgs extends readonly unknown[],
  IndexAcc extends unknown[] = [],
> = TArgs extends readonly []
  ? {}
  : TArgs extends readonly [infer First, ...infer Rest]
    ? {
        readonly [Index in IndexAcc['length']]?: BreadcrumbConfigEntry<First>;
      } & BreadcrumbConfigTuple<
        Rest extends readonly unknown[] ? Rest : [],
        [...IndexAcc, unknown]
      >
    : {};

type BreadcrumbConfigFallback<TArgs extends readonly unknown[]> = {
  readonly [Index in number]?:
    | (KeyArrayFor<TArgs[number]> extends never
        ? readonly string[]
        : KeyArrayFor<TArgs[number]>)
    | BreadcrumbTransformer<TArgs[number]>;
};

type TupleBreadcrumbExtractors<
  TArgs extends readonly unknown[],
  IndexAcc extends unknown[] = [],
> = TArgs extends readonly []
  ? never
  : TArgs extends readonly [infer First, ...infer Rest]
    ?
        | (KeyArrayFor<First> extends never
            ? never
            : {
                readonly param: IndexAcc['length'];
                readonly keys: KeyArrayFor<First>;
              })
        | {
            readonly param: IndexAcc['length'];
            readonly transform: BreadcrumbTransformer<First>;
          }
        | {
            readonly param: IndexAcc['length'];
            readonly as: 'length' | 'type' | 'value' | 'toString';
          }
        | TupleBreadcrumbExtractors<
            Rest extends readonly unknown[] ? Rest : [],
            [...IndexAcc, unknown]
          >
    : never;

type GenericBreadcrumbKeys<TArgs extends readonly unknown[]> =
  KeyArrayFor<TArgs[number]> extends never
    ? {
        readonly param: number;
        readonly keys: readonly string[];
      }
    : {
        readonly param: number;
        readonly keys: KeyArrayFor<TArgs[number]>;
      };

type GenericBreadcrumbExtractor<TArgs extends readonly unknown[]> =
  | GenericBreadcrumbKeys<TArgs>
  | {
      readonly param: number;
      readonly transform: BreadcrumbTransformer<TArgs[number]>;
    }
  | {
      readonly param: number;
      readonly as: 'length' | 'type' | 'value' | 'toString';
    };

/**
 * Utility type that validates keys exist on the first parameter type.
 * Returns the key array type if valid, or never if any key is invalid.
 */
export type ValidateKeys<
  TArgs extends readonly unknown[],
  Keys extends readonly string[],
> =
  TArgs[0] extends Record<string, any>
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
    ? readonly [
        BreadcrumbTransformer<First>?,
        ...VariadicBreadcrumbTransformers<Rest>,
      ]
    : readonly [];

/**
 * Breadcrumb extractor configuration for array syntax
 */
export type BreadcrumbExtractor<TArgs extends readonly unknown[]> =
  IsTuple<TArgs> extends true
    ? TupleBreadcrumbExtractors<TArgs>
    : GenericBreadcrumbExtractor<TArgs>;

// Positional breadcrumb syntax where each entry corresponds to the argument position
// - string => maps the argument value to the given breadcrumb key
// - string[] => extract keys from an object argument
// - BreadcrumbExtractor => advanced per-entry extractor (still supported)
export type PositionalBreadcrumbs<TArgs extends readonly unknown[]> = readonly (
  | string
  | readonly string[]
  | BreadcrumbExtractor<TArgs>
)[];

/**
 * Object-style breadcrumb configuration
 */
export type BreadcrumbConfig<TArgs extends readonly unknown[]> =
  IsTuple<TArgs> extends true
    ? BreadcrumbConfigTuple<TArgs>
    : BreadcrumbConfigFallback<TArgs>;

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
    super(
      `Breadcrumb transformation failed (${transformerType}): ${originalError.message}`,
    );
    this.name = 'BreadcrumbTransformationError';
  }
}
