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
  /**
   * Object roots already emitted from this scope, so a root whose entries span
   * an overflow flush is not emitted again by a later batch (report-once holds
   * across overflow boundaries). Only object roots are tracked — primitive
   * throws carry no identity and never merge, so tracking them would wrongly
   * suppress genuinely independent failures. Lazily created on first emit.
   *
   * Memory tradeoff: the set holds strong references to emitted roots for the
   * scope's lifetime. It grows only by one entry per *emitted distinct root*
   * (not per collected error), and the scope dies with its boundary/request,
   * so a long-lived boundary under pathological volume trades a bounded set of
   * root references for the report-once guarantee.
   */
  emittedRoots?: Set<object>;
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
  /** `true` once any reporter (entry or user) has been installed. */
  reporterInstalled: boolean;
  /** Shared throw-through list, so all entry bundles in one realm agree. */
  ignoreErrorTypes: string[];
}

// Versioned so a future breaking change to the registry shape bumps the key
// rather than letting a newer reader inherit an older, incompatible object.
// Different majors therefore get separate registries (correct — they don't
// need to converge); same-major bundles still share one.
const REGISTRY_KEY = Symbol.for('@power-rent/try-catch/registry/v1');

/**
 * Read (lazily creating) the shared registry. The registry lives on
 * `globalThis` so all loaded entry bundles in one realm share it.
 *
 * When adopting a registry created by another loaded bundle, missing fields are
 * coalesced to safe defaults: two builds that pin the same `Symbol.for` key but
 * disagree on shape (e.g. a skewed install) must never make a reader throw —
 * the library's never-throw contract depends on `getIgnoreErrorTypes()` always
 * returning an array.
 */
export function getRegistry(): Registry {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>;
  const existing = holder[REGISTRY_KEY];
  if (existing) {
    existing.scopeProvider ??= new NoopScopeProvider();
    existing.defaultReporter ??= new NoopReporter();
    existing.ignoreErrorTypes ??= [];
    return existing;
  }
  const created: Registry = {
    scopeProvider: new NoopScopeProvider(),
    defaultReporter: new NoopReporter(),
    reporterInstalled: false,
    ignoreErrorTypes: [],
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

const ALS_KEY = Symbol.for('@power-rent/try-catch/als/v1');

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
  const registry = getRegistry();
  registry.defaultReporter = reporter;
  registry.reporterInstalled = true;
}

/**
 * Install a default reporter only if none is installed yet (first-wins across
 * entry bundles). The `/node` entry uses this so a transitively-loaded `/node`
 * does not clobber a reporter an application already configured.
 *
 * Note: first-wins is load-order-dependent and therefore NOT a reliable guard
 * for platform priority — if `/node` happens to initialize before a Next.js
 * app's `/nextjs` entry, `NodeReporter` would win. The `/nextjs` entry
 * deliberately uses the last-wins {@link setDefaultReporter} instead (its
 * presence is authoritative for a Next.js app) so platform priority does not
 * depend on import order. The public `Try.setDefaultReporter` is also last-wins,
 * so explicit user overrides always apply.
 */
export function setDefaultReporterIfAbsent(reporter: Reporter): void {
  const registry = getRegistry();
  if (!registry.reporterInstalled) {
    registry.defaultReporter = reporter;
    registry.reporterInstalled = true;
  }
}

export function getDefaultReporter(): Reporter {
  return getRegistry().defaultReporter;
}

export function setIgnoreErrorTypes(types: string[]): void {
  getRegistry().ignoreErrorTypes = types;
}

export function getIgnoreErrorTypes(): string[] {
  // Always an array: getRegistry() coalesces `ignoreErrorTypes` to `[]`
  // before returning (its skew-hardening contract).
  return getRegistry().ignoreErrorTypes;
}
