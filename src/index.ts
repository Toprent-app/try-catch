/**
 * Main entry point for the Try-Catch library
 */

// Export core framework-agnostic functionality
export { Try, TryResult, Reporter, NoopReporter } from './core';
export type { ErrorReportConfig } from './core/reporter';

// Export utilities
export * from './utils/types';
export * from './utils/transformers';
export * from './utils/breadcrumbs';
