import { Reporter, NoopReporter } from './reporter';

/**
 * One layer's contribution to a report-once scope: the original error it
 * caught plus the reporting context configured on that `Try` instance.
 */
export interface Collected {
  /** The original error THIS layer caught (`cachedResult.error`), cause chain intact. */
  readonly error: Error;
  /** `config.message`; `undefined` → contributes no cause node (breadcrumb-only entry). */
  readonly message?: string;
  readonly tags: Readonly<Record<string, string>>;
  readonly breadcrumbData?: Record<string, unknown>;
  readonly functionName?: string;
}

/**
 * Aggregation scope opened by the outermost (boundary) `Try` in an async
 * context tree. Nested `Try` instances append into it; the boundary flushes
 * exactly once.
 */
export interface Scope {
  /** Append-only during the scope's life. */
  readonly errors: Collected[];
  /** Set `true` after the boundary emits; guards late/repeat flush. */
  flushed: boolean;
}

/**
 * Strategy for establishing and reading the active {@link Scope}. The default
 * ({@link NoopScopeProvider}) keeps the legacy per-terminal reporting path; an
 * `AsyncLocalStorage`-backed provider (Node) enables the collector path.
 */
export interface ScopeProvider {
  /** `false` → legacy path (browser/core/Edge); `true` → collector path (Node). */
  readonly collects: boolean;
  getStore(): Scope | undefined;
  /** Establish `scope` for `fn` and its async continuations; returns `fn()` synchronously. */
  run<T>(scope: Scope, fn: () => T): T;
}

/**
 * Default provider: no aggregation. Keeps browser/core/Edge on the legacy path.
 */
export class NoopScopeProvider implements ScopeProvider {
  readonly collects = false;

  getStore(): Scope | undefined {
    return undefined;
  }

  run<T>(_scope: Scope, fn: () => T): T {
    return fn();
  }
}

/**
 * Process-wide registry shared via a `globalThis` `Symbol` so the per-entry
 * `Try` bundles (tsup `splitting:false` inlines one `Try` class per entry) and
 * the ALS provider all converge on a single provider + default reporter.
 */
interface Registry {
  scopeProvider: ScopeProvider;
  defaultReporter: Reporter;
}

const REGISTRY_KEY = Symbol.for('@power-rent/try-catch/registry');

/**
 * Read (lazily creating) the shared registry. The registry lives on
 * `globalThis` so all loaded entry bundles in one realm share it.
 */
export function getRegistry(): Registry {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>;
  const existing = holder[REGISTRY_KEY];
  if (existing) {
    return existing;
  }
  const created: Registry = {
    scopeProvider: new NoopScopeProvider(),
    defaultReporter: new NoopReporter(),
  };
  holder[REGISTRY_KEY] = created;
  return created;
}

/** Install a scope provider (last-wins; idempotent for an identical provider). */
export function setScopeProvider(provider: ScopeProvider): void {
  getRegistry().scopeProvider = provider;
}

export function getScopeProvider(): ScopeProvider {
  return getRegistry().scopeProvider;
}

/**
 * Structural type for an `AsyncLocalStorage<Scope>`. Declaring it structurally
 * keeps this core module free of `node:async_hooks` so it stays browser-safe.
 */
export interface AlsLike {
  getStore(): Scope | undefined;
  run<T>(scope: Scope, fn: () => T): T;
}

const ALS_KEY = Symbol.for('@power-rent/try-catch/als');

/**
 * Install an ALS-backed collector provider, sharing a single ALS across entry
 * bundles via `globalThis`. Idempotent: an already-installed collector is left
 * in place, and `createAls` runs only when no shared ALS exists yet (so `/node`
 * and `/nextjs` in one realm converge on one scope).
 */
export function installCollector(createAls: () => AlsLike): void {
  if (getScopeProvider().collects) {
    return;
  }
  const holder = globalThis as unknown as Record<symbol, AlsLike | undefined>;
  const als = (holder[ALS_KEY] ??= createAls());
  setScopeProvider({
    collects: true,
    getStore: () => als.getStore(),
    run: (scope, fn) => als.run(scope, fn),
  });
}

export function setDefaultReporter(reporter: Reporter): void {
  getRegistry().defaultReporter = reporter;
}

export function getDefaultReporter(): Reporter {
  return getRegistry().defaultReporter;
}
