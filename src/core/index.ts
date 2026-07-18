/**
 * Core Try-Catch functionality without any specific error reporting implementation
 */

export { Try, TryResult } from './Try';
export {
  Reporter,
  NoopReporter,
  ErrorReportConfig,
  CaptureOptions,
  CaptureBreadcrumb,
} from './reporter';
export {
  Scope,
  Collected,
  ScopeProvider,
  NoopScopeProvider,
  setScopeProvider,
  getScopeProvider,
} from './scope';
