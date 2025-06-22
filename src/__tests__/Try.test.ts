import { describe, it, expect, vi, afterEach } from 'vitest';

import Try from '../Try';

// Mock Sentry SDK
vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

const Sentry = await import('@sentry/nextjs');

async function throwingFunction(_params: Record<string, unknown>): Promise<{ ok: boolean; }> {
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

describe('Try helper', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return default value and report error', async () => {
    const defaultVal = { value: 'fallback' };
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .report('failed to get data')
      .default(defaultVal);

    expect(result).toBe(defaultVal);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should rethrow error after reporting', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const exec = new Try(throwingFunction, params)
      .report('failed')
      .rethrow()
      .unwrap();

    await expect(exec).rejects.toThrow('boom');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should send breadcrumbs when configured', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    await new Try(throwingFunction, params)
      .breadcrumbs(['parameterKey'])
      .report('oops')
      .default(null);

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
    const result = await new Try(successfulFunction, params)
      .tag('name', 'value')
      .tag('test', 'true')
      .unwrap();
    expect(result).toEqual({ ok: true, ...params });
    // captureException should not be called on success
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should returns the actual error', async () => {
    const params = { parameterKey: 'alpha' };
    const result = await new Try(throwingFunction, params)
      .error();
    expect(result).toEqual(new Error('boom'));
  });
});
