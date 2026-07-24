/**
 * Main entry point for the Try-Catch library
 */

// Export core framework-agnostic functionality.
// `Try` is also the default export, matching the /node, /browser, and /nextjs
// entries so `import Try from '@power-rent/try-catch'` works for every entry.
export { Try, Try as default, TryResult, Reporter, NoopReporter } from './core';
export type { PublicTry } from './core';
export type { ErrorReportConfig } from './core/reporter';

// Export utilities
export * from './utils/types';
export * from './utils/transformers';
export * from './utils/breadcrumbs';
