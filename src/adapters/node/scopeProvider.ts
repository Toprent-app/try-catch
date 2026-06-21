import { AsyncLocalStorage } from 'node:async_hooks';
import { installCollector } from '../../core/scope';
import type { Scope } from '../../core/scope';

/**
 * Enable report-once aggregation backed by `AsyncLocalStorage`. The shared ALS
 * lives on `globalThis` (see {@link installCollector}) so multiple server entry
 * bundles loaded in one realm aggregate into a single scope.
 */
export function installNodeScopeProvider(): void {
  installCollector(() => new AsyncLocalStorage<Scope>());
}
