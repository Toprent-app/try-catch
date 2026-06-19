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
} from '../core/scope';
import { NoopReporter, Reporter } from '../core/reporter';
import { Try } from '../core/Try';

const REGISTRY_KEY = Symbol.for('@power-rent/try-catch/registry');

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
});
