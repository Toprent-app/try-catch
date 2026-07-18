import { describe, it, expect } from 'vitest';

import { NoopReporter, type Reporter } from '../core/reporter';

describe('core/reporter — NoopReporter', () => {
  it('report() does nothing and does not throw', () => {
    const reporter = new NoopReporter();

    expect(() =>
      reporter.report(new Error('boom'), { tags: {} }),
    ).not.toThrow();
  });

  it('addBreadcrumbs() does nothing and does not throw', () => {
    const reporter = new NoopReporter();

    expect(() => reporter.addBreadcrumbs({ a: 1 }, 'fn')).not.toThrow();
    expect(() => reporter.addBreadcrumbs({ a: 1 })).not.toThrow();
  });

  it('createWrappedError() wraps the message and preserves cause + stack', () => {
    const root = new Error('root');
    root.stack = 'ROOT_STACK';

    const wrapped = new NoopReporter().createWrappedError(root, 'wrapped');

    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('wrapped');
    expect(wrapped.cause).toBe(root);
    expect(wrapped.stack).toBe('ROOT_STACK');
  });

  it('does not define capture(), so the collector flush routes to report()', () => {
    // A no-op capture here would be inherited by subclasses that override only
    // report(), silently dropping every report-once event. Absence is the
    // contract: emitGroup must take the report() fallback.
    const reporter: Reporter = new NoopReporter();
    expect(reporter.capture).toBeUndefined();
  });
});
