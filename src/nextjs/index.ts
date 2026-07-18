import { Try as CoreTry } from '../core/Try';
import { installCollector, setDefaultReporter } from '../core/scope';
import type { AlsLike, Scope } from '../core/scope';
import { SentryReporter } from './SentryReporter';

export type { TryResult } from '../core/Try';

// Force the Sentry (`@sentry/nextjs`) reporter as the default. The `/nextjs`
// entry being loaded is authoritative for a Next.js app, so it wins regardless
// of import order — a transitively-loaded `/node` entry must not route this
// app's events to a typically-uninitialized `@sentry/node`. An explicit
// `Try.setDefaultReporter` still overrides (also last-wins). Residual: a
// pure-Node app that transitively imports `/nextjs` forces `SentryReporter`;
// such apps should call `Try.setDefaultReporter` explicitly.
setDefaultReporter(new SentryReporter());

/**
 * Enable report-once aggregation only on the Next.js Node.js runtime.
 *
 * The collector is installed **synchronously** at entry-module evaluation via
 * `process.getBuiltinModule('node:async_hooks')` (Node >= 20.16 / 22.3), so a
 * `Try` that runs in the same synchronous tick as module load already
 * aggregates — no cold-start window in which chains double-report. That API
 * needs no import at all, which keeps the Edge and client bundles free of any
 * `node:` reference. (`module.createRequire(import.meta.url)` is not an option
 * here: the entry is built as both CJS and ESM from one source, and a static
 * `node:module` import would leak into the Edge bundle.)
 *
 * When the synchronous path is unavailable (older Node without
 * `getBuiltinModule`), it falls back to the previous runtime-guarded dynamic
 * import, which resolves during module initialization — before request
 * handling — so the collector is live by the first request; only a `Try` in
 * the load tick itself would briefly use the legacy path there.
 */
function installNextjsCollector(): void {
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  try {
    const getBuiltinModule = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule;
    const hooks =
      typeof getBuiltinModule === 'function'
        ? (getBuiltinModule.call(process, 'node:async_hooks') as
            | { AsyncLocalStorage?: new () => AlsLike }
            | undefined)
        : undefined;
    const AsyncLocalStorage = hooks?.AsyncLocalStorage;
    if (typeof AsyncLocalStorage === 'function') {
      installCollector(() => new AsyncLocalStorage());
      return;
    }
  } catch {
    // fall through to the async dynamic-import path
  }
  void import('node:async_hooks')
    .then(({ AsyncLocalStorage }) => {
      installCollector(() => new AsyncLocalStorage<Scope>());
    })
    .catch(() => {
      // async_hooks unavailable → stay on the legacy path
    });
}

installNextjsCollector();

/**
 * NextJS-specific Try class with Sentry integration pre-configured.
 * This extends the core Try class and automatically sets up Sentry reporting.
 *
 * Usage:
 *   const result = new Try(asyncFn, arg1, arg2)
 *     .breadcrumbs(['id'])
 *     .report('failed to execute')
 *     .unwrap();
 */
export class Try<
  T,
  TArgs extends readonly unknown[] = unknown[],
> extends CoreTry<T, TArgs> {
  /**
   * Configure error types that should be thrown through without being wrapped.
   * When using `.report()`, errors matching these types will be re-thrown as-is
   * instead of being wrapped with the custom message.
   *
   * @param ignoreErrorTypes Array of error type names (error.name) to throw through
   *
   * @example
   * ```typescript
   * // Configure to throw ValidationError and AuthError as-is
   * Try.throwThroughErrorTypes(['ValidationError', 'AuthError']);
   *
   * // Now these errors won't be wrapped:
   * await new Try(validateUser, userData)
   *   .report('User validation failed') // ValidationError will be thrown as-is
   *   .unwrap();
   * ```
   */
  public static throwThroughErrorTypes(ignoreErrorTypes: string[]) {
    CoreTry.throwThroughErrorTypes(ignoreErrorTypes);
  }
}

export default Try;
