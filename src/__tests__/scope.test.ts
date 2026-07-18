import { describe, it, expect, beforeEach } from 'vitest';

import {
  NoopScopeProvider,
  ScopeProvider,
  Scope,
  getRegistry,
  getScopeProvider,
  setScopeProvider,
  getDefaultReporter,
  setDefaultReporter,
  setDefaultReporterIfAbsent,
  getIgnoreErrorTypes,
  setIgnoreErrorTypes,
} from '../core/scope';
import { NoopReporter, Reporter } from '../core/reporter';
import { Try } from '../core/Try';

const REGISTRY_KEY = Symbol.for('@power-rent/try-catch/registry/v1');

function resetRegistry(): void {
  delete (globalThis as Record<symbol, unknown>)[REGISTRY_KEY];
}

describe('core/scope', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('NoopScopeProvider', () => {
    it('does not collect', () => {
      expect(new NoopScopeProvider().collects).toBe(false);
    });

    it('has no active store', () => {
      expect(new NoopScopeProvider().getStore()).toBeUndefined();
    });

    it('runs the function synchronously and returns its value', () => {
      let ran = false;
      const scope: Scope = { errors: [], flushed: false };

      const out = new NoopScopeProvider().run(scope, () => {
        ran = true;
        return 42;
      });

      expect(ran).toBe(true);
      expect(out).toBe(42);
    });
  });

  describe('getRegistry', () => {
    it('lazily creates a registry seeded with the no-op defaults', () => {
      const reg = getRegistry();

      expect(reg.scopeProvider).toBeInstanceOf(NoopScopeProvider);
      expect(reg.defaultReporter).toBeInstanceOf(NoopReporter);
    });

    it('returns the same registry instance on subsequent calls', () => {
      expect(getRegistry()).toBe(getRegistry());
    });

    it('stores the registry on globalThis under the shared symbol', () => {
      const reg = getRegistry();
      expect((globalThis as Record<symbol, unknown>)[REGISTRY_KEY]).toBe(reg);
    });
  });

  describe('scope provider accessors', () => {
    it('defaults to a no-op provider', () => {
      expect(getScopeProvider()).toBeInstanceOf(NoopScopeProvider);
    });

    it('installs and reads back a custom provider', () => {
      const provider: ScopeProvider = {
        collects: true,
        getStore: () => undefined,
        run: (_scope, fn) => fn(),
      };

      setScopeProvider(provider);

      expect(getScopeProvider()).toBe(provider);
    });

    it('is idempotent for an identical provider', () => {
      const provider = new NoopScopeProvider();

      setScopeProvider(provider);
      setScopeProvider(provider);

      expect(getScopeProvider()).toBe(provider);
    });
  });

  describe('default reporter accessors', () => {
    it('defaults to a no-op reporter', () => {
      expect(getDefaultReporter()).toBeInstanceOf(NoopReporter);
    });

    it('installs and reads back a custom reporter', () => {
      const reporter = new NoopReporter();

      setDefaultReporter(reporter);

      expect(getDefaultReporter()).toBe(reporter);
    });
  });

  describe('setDefaultReporterIfAbsent (first-wins across entries)', () => {
    it('installs when no reporter has been set yet', () => {
      const first = new NoopReporter();

      setDefaultReporterIfAbsent(first);

      expect(getDefaultReporter()).toBe(first);
    });

    it('does not clobber a reporter already installed by another entry', () => {
      const first = new NoopReporter();
      const second = new NoopReporter();

      setDefaultReporterIfAbsent(first);
      setDefaultReporterIfAbsent(second);

      // First entry wins; a later entry must not overwrite it (otherwise a
      // transitively loaded /node entry could route a Next.js app's events to
      // an uninitialized @sentry/node and silently drop them).
      expect(getDefaultReporter()).toBe(first);
    });

    it('never overrides an explicit user reporter regardless of load order', () => {
      const user = new NoopReporter();
      const entry = new NoopReporter();

      setDefaultReporter(user);
      setDefaultReporterIfAbsent(entry);

      expect(getDefaultReporter()).toBe(user);
    });
  });

  describe('ignore error types accessors', () => {
    it('defaults to an empty list', () => {
      expect(getIgnoreErrorTypes()).toEqual([]);
    });

    it('installs and reads back the throw-through list', () => {
      setIgnoreErrorTypes(['ValidationError', 'AuthError']);

      expect(getIgnoreErrorTypes()).toEqual(['ValidationError', 'AuthError']);
    });
  });

  describe('Try static delegation', () => {
    it('delegates scope provider statics to the registry', () => {
      const provider: ScopeProvider = {
        collects: true,
        getStore: () => undefined,
        run: (_scope, fn) => fn(),
      };

      Try.setScopeProvider(provider);

      expect(Try.getScopeProvider()).toBe(provider);
      expect(getScopeProvider()).toBe(provider);
    });

    it('delegates default reporter statics to the registry', () => {
      const reporter: Reporter = new NoopReporter();

      Try.setDefaultReporter(reporter);

      expect(Try.getDefaultReporter()).toBe(reporter);
      expect(getDefaultReporter()).toBe(reporter);
    });
  });

  describe('report-once hardening', () => {
    it('getIgnoreErrorTypes tolerates a skewed registry missing the field', () => {
      // Simulate a registry created by another build that pinned the same
      // Symbol.for key but lacked `ignoreErrorTypes` (cross-version skew).
      (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = {
        scopeProvider: new NoopScopeProvider(),
        defaultReporter: new NoopReporter(),
        reporterInstalled: true,
      };

      expect(getIgnoreErrorTypes()).toEqual([]);
    });

    it('unwrap() throws the wrapped error (never a TypeError) against a skewed registry', async () => {
      (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = {
        scopeProvider: new NoopScopeProvider(),
        defaultReporter: new NoopReporter(),
        reporterInstalled: true,
        // ignoreErrorTypes intentionally absent
      };

      await expect(
        new Try(async (): Promise<never> => {
          throw new Error('boom');
        })
          .report('failed')
          .unwrap(),
      ).rejects.toThrow('failed');
    });

    it('a forced reporter wins over a prior if-absent, regardless of load order', () => {
      const nodeReporter = new NoopReporter();
      const nextjsReporter = new NoopReporter();

      // Mirrors the real wiring: /node installs if-absent, then the /nextjs
      // entry forces its reporter (its presence is authoritative for the app).
      setDefaultReporterIfAbsent(nodeReporter);
      setDefaultReporter(nextjsReporter);

      expect(getDefaultReporter()).toBe(nextjsReporter);
    });

    it('a provider that throws from getStore falls back to legacy (never-throw preserved)', async () => {
      setScopeProvider({
        collects: true,
        getStore: () => {
          throw new Error('provider down');
        },
        run: (_scope, fn) => fn(),
      });

      const out = await new Try(async (): Promise<never> => {
        throw new Error('boom');
      }).value();
      const err = await new Try(async (): Promise<never> => {
        throw new Error('boom');
      }).error();

      expect(out).toBeUndefined();
      expect((err as Error).message).toBe('boom');
    });
  });
});
