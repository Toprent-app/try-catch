import { describe, it, expect, vi, afterEach } from 'vitest';

import Try from '../nextjs';

// Mock Sentry SDK
vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

const Sentry = await import('@sentry/nextjs');

// Helper to silence console.error only when `throwingFunction` is executed
const silenceConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => { });

async function throwingFunction(_params: Record<string, unknown>): Promise<{ ok: boolean; }> {
  // Prevent error logs for the intentional failure in this helper
  silenceConsoleError();
  throw new Error('boom');
}

async function successfulFunction(params: Record<string, unknown>): Promise<{ ok: boolean; }> {
  return { ok: true, ...params };
}

class TestClass {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  greet(greeting: string) {
    return `${greeting}, I'm ${this.name}`;
  }
}

describe('Try', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return default value', async () => {
    const defaultVal = { value: 'fallback' };
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .default(defaultVal)
      .value();

    expect(result).toBe(defaultVal);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should return default value and report error', async () => {
    const defaultVal = { value: 'fallback' };
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .report('failed to get data')
      .default(defaultVal)
      .value();

    expect(result).toBe(defaultVal);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should rethrow error', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const exec = new Try(throwingFunction, params)
      .unwrap();

    await expect(exec).rejects.toThrow('boom');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should return undefined', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .value();

    expect(result).toBe(undefined);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should return the value', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(successfulFunction, params)
      .value();

    expect(result).toEqual({ ok: true, ...params });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should throw an error', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const exec = new Try(throwingFunction, params)
      .report('failed')
      .unwrap();

    await expect(exec).rejects.toThrow('failed');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should throw the original error', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const exec = new Try(throwingFunction, params)
      .unwrap();

    await expect(exec).rejects.toThrow('boom');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should send breadcrumbs', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    await new Try(throwingFunction, params)
      .breadcrumbs(['parameterKey']);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { 'parameterKey': 'alpha' } })
    );
  });

  it('should return the function result', async () => {
    const params = { parameterKey: 'alpha' };
    const result = await new Try(successfulFunction, params).unwrap();
    expect(result).toEqual({ ok: true, ...params });
    // captureException should not be called on success
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should return a class method result', async () => {
    const params = 'Hi!';
    const newTest = new TestClass('newTest');
    const result = await new Try(newTest.greet.bind(newTest), params).unwrap();
    expect(result).toBe('Hi!, I\'m newTest');
    // captureException should not be called on success
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should add tags', async () => {
    const params = { parameterKey: 'alpha' };
    const exec = new Try(throwingFunction, params)
      .report('failed')
      .tag('name', 'value')
      .tag('test', 'true')
      .unwrap();
    await expect(exec).rejects.toThrow('failed');
    // captureException should not be called on success
    expect(Sentry.captureException).toBeCalledWith(new Error('failed', {
      cause: new Error('boom')
    }), {
      tags: {
        library: '@power-rent/try-catch',
        name: 'value',
        test: 'true',
      }
    });
  });

  it('should returns the actual error', async () => {
    const params = { parameterKey: 'alpha' };
    const result = await new Try(throwingFunction, params)
      .error();
    expect(result).toEqual(new Error('boom'));
  });
});
