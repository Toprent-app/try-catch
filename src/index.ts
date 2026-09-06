/**
 * Main entry point for the Try-Catch library
 */

// Export core framework-agnostic functionality.
// `Try` is also the default export, matching the /node, /browser, and /nextjs
// entries so `import Try from '@power-rent/try-catch'` works for every entry.
export { Try, Try as default, NoopReporter } from './core/index.js';
export type { TryResult, Reporter, PublicTry } from './core/index.js';
export type { ErrorReportConfig } from './core/reporter.js';

// Export utilities
export * from './utils/index.js';
