import { describe, it, expect, vi, afterEach } from 'vitest';

import Try, { TryResult } from '../nextjs';

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

class GraphQLError extends Error {
  name = 'GraphQLError'
}

async function throwingCustomError(_params: Record<string, unknown>): Promise<{ ok: boolean; }> {
  throw new GraphQLError('validation error');
}

async function successfulFunction(params: Record<string, unknown>): Promise<{ ok: boolean; }> {
  return { ok: true, ...params };
}

class TestClass {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  greet({ greeting }: { greeting: string }) {
    return `${greeting}, I'm ${this.name}`;
  }
}

describe('Try', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Try.throwThroughErrorTypes([]);
  });

  it('should return default value', async () => {
    const defaultVal = { value: 'fallback' };
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .debug(false)
      .default(defaultVal)
      .value();

    expect(result).toBe(defaultVal);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should work without parameters', async () => {
    const defaultVal = { value: 'fallback' };

    const result = await new Try(() => false)
      .default(defaultVal)
      .value();

    expect(result).toBe(false);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should return default value and report error', async () => {
    const defaultVal = { value: 'fallback' };
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .debug(false)
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
      .debug(false)
      .unwrap();

    await expect(exec).rejects.toThrow('boom');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should return undefined', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const result = await new Try(throwingFunction, params)
      .debug(false)
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
      .debug(false)
      .report('failed')
      .unwrap();

    await expect(exec).rejects.toThrow('failed');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('should throw the original error', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    const exec = new Try(throwingFunction, params)
      .debug(false)
      .unwrap();

    await expect(exec).rejects.toThrow('boom');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should send breadcrumbs', async () => {
    const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

    await new Try(throwingFunction, params)
      .debug(false)
      .breadcrumbs(['parameterKey']);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling throwingFunction function',
        data: {
          'parameterKey': 'alpha'
        }
      })
    );
  });

  it('should return the function result', async () => {
    const params = { parameterKey: 'alpha' };

    const result = await new Try(successfulFunction, params).unwrap();

    expect(result).toEqual({ ok: true, ...params });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should return a class method result', async () => {
    const greeting = 'Hi!';
    const newTest = new TestClass('newTest');

    const result = await new Try(newTest.greet.bind(newTest), { greeting }).unwrap();

    expect(result).toEqual('Hi!, I\'m newTest');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should add tags', async () => {
    const params = { parameterKey: 'alpha' };

    const exec = new Try(throwingFunction, params)
      .debug(false)
      .report('failed')
      .tag('name', 'value')
      .tag('test', 'true')
      .unwrap();

    await expect(exec).rejects.toThrow('failed');

    const expectedError = new Error('failed');
    expectedError.cause = new Error('boom');

    expect(Sentry.captureException).toBeCalledWith(expectedError, {
      tags: {
        library: '@power-rent/try-catch',
        name: 'value',
        test: 'true',
      }
    });
  });

  it('should return the actual error', async () => {
    const params = { parameterKey: 'alpha' };

    const result = await new Try(throwingFunction, params)
      .debug(false)
      .error();

    expect(result).toEqual(new Error('boom'));
  });

  it('should return the actual error', async () => {
    Try.throwThroughErrorTypes(['GraphQLError']);
    const params = { parameterKey: 'alpha' };

    const exec = new Try(throwingCustomError, params)
      .debug(false)
      .report('failed')
      .unwrap();

    await expect(exec).rejects.toThrow('validation error');
  });

  it('should not give typescript error', async () => {
    const params = { parameterKey: 'alpha' };

    const result = await new Try(throwingFunction, params)
      .debug(false)
      .default({ ok: true })
      .value();

    expect(result).not.toBe(undefined);
    expect(() => result.ok).not.toThrow(TypeError);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('should execute finally callback on success', async () => {
    const params = { parameterKey: 'alpha' };
    const finallySpy = vi.fn();

    await new Try(successfulFunction, params)
      .finally(finallySpy)
      .unwrap();

    expect(finallySpy).toHaveBeenCalledTimes(1);
  });

  it('should execute finally callback on error', async () => {
    const params = { parameterKey: 'alpha' };
    const finallySpy = vi.fn();

    const exec = new Try(throwingFunction, params)
      .debug(false)
      .finally(finallySpy)
      .unwrap();
    await expect(exec).rejects.toThrow('boom');
    expect(finallySpy).toHaveBeenCalledTimes(1);
  });

  it('should work with string parameters', async () => {
    function greet(name: string, greeting: string = 'Hello') {
      return `${greeting}, ${name}!`;
    }

    const result = await new Try(greet, 'Alice', 'Hi').value();
    expect(result).toBe('Hi, Alice!');
  });

  it('should work with number parameters', async () => {
    function add(a: number, b: number): number {
      return a + b;
    }

    const result = await new Try(add, 5, 3).unwrap();
    expect(result).toBe(8);
  });

  it('should work with mixed parameter types', async () => {
    function formatMessage(id: number, message: string, urgent: boolean): string {
      const prefix = urgent ? '[URGENT]' : '[INFO]';
      return `${prefix} #${id}: ${message}`;
    }

    const result = await new Try(formatMessage, 123, 'Test message', true).value();
    expect(result).toBe('[URGENT] #123: Test message');
  });

  it('should work with no parameters', async () => {
    function getCurrentTime(): number {
      return Date.now();
    }

    const result = await new Try(getCurrentTime).value();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  it('should not allow breadcrumbs with non-object first parameter', async () => {
    function processString(str: string): string {
      return str.toUpperCase();
    }

    // This should show a TypeScript error if breadcrumbs is called with non-object parameter
    const tryInstance = new Try(processString, 'hello');

    // Test that it still works without breadcrumbs
    const result = await tryInstance
      .report('String processing failed')
      .tag('operation', 'uppercase')
      .value();

    expect(result).toBe('HELLO');
  });

  it('should not log errors by default', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };

    await new Try(throwingFunction, params).debug(false).value();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should log errors when debug is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };

    await new Try(throwingFunction, params)
      .debug()
      .value();

    expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
    consoleSpy.mockRestore();
  });

  it('should not log errors when debug is explicitly disabled', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };

    await new Try(throwingFunction, params)
      .debug(false)
      .value();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should log finally callback errors when debug is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };
    const throwingFinally = () => { throw new Error('finally error'); };

    await new Try(successfulFunction, params)
      .debug()
      .finally(throwingFinally)
      .value();

    expect(consoleSpy).toHaveBeenCalledWith('Error in finally callback', new Error('finally error'));
    consoleSpy.mockRestore();
  });

  it('should not log finally callback errors when debug is disabled', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };
    const throwingFinally = () => { throw new Error('finally error'); };

    await new Try(successfulFunction, params)
      .finally(throwingFinally)
      .value();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should support conditional debug logging', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };
    const isDevelopment = true;

    await new Try(throwingFunction, params)
      .debug(isDevelopment)
      .value();

    expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
    consoleSpy.mockRestore();
  });

  it('should include function name in breadcrumbs for anonymous functions', async () => {
    const params = { parameterKey: 'beta' };

    await new Try(async (_data: Record<string, unknown>) => { throw new Error('anonymous error'); }, params)
      .debug(false)
      .breadcrumbs(['parameterKey'])
      .value();

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calling anonymous function',
        data: {
          'parameterKey': 'beta'
        }
      })
    );
  });

  it('should await async finally callbacks', async () => {
    const params = { parameterKey: 'alpha' };
    const finallySpy = vi.fn();
    let asyncCallbackResolved = false;
    
    const asyncFinally = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncCallbackResolved = true;
      finallySpy();
    };

    await new Try(successfulFunction, params)
      .finally(asyncFinally)
      .unwrap();

    expect(asyncCallbackResolved).toBe(true);
    expect(finallySpy).toHaveBeenCalledTimes(1);
  });

  it('should await async finally callbacks on error', async () => {
    const params = { parameterKey: 'alpha' };
    const finallySpy = vi.fn();
    let asyncCallbackResolved = false;
    
    const asyncFinally = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncCallbackResolved = true;
      finallySpy();
    };

    const exec = new Try(throwingFunction, params)
      .debug(false)
      .finally(asyncFinally)
      .unwrap();
      
    await expect(exec).rejects.toThrow('boom');
    expect(asyncCallbackResolved).toBe(true);
    expect(finallySpy).toHaveBeenCalledTimes(1);
  });

  it('should handle async finally callback errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };
    
    const throwingAsyncFinally = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      throw new Error('async finally error');
    };

    await new Try(successfulFunction, params)
      .debug()
      .finally(throwingAsyncFinally)
      .value();

    expect(consoleSpy).toHaveBeenCalledWith('Error in finally callback', new Error('async finally error'));
    consoleSpy.mockRestore();
  });

  it('should handle async finally callback errors without debug', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const params = { parameterKey: 'alpha' };
    
    const throwingAsyncFinally = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      throw new Error('async finally error');
    };

    await new Try(successfulFunction, params)
      .debug(false)
      .finally(throwingAsyncFinally)
      .value();

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  describe('.result() method', () => {
    it('should return success result object', async () => {
      const params = { parameterKey: 'alpha' };

      const result = await new Try(successfulFunction, params).result();

      expect(result).toEqual({
        success: true,
        value: { ok: true, ...params }
      });
    });

    it('should return error result object', async () => {
      const params = { parameterKey: 'alpha' };

      const result = await new Try(throwingFunction, params)
        .debug(false)
        .result();

      expect(result).toEqual({
        success: false,
        error: new Error('boom')
      });
    });

    it('should not report errors to Sentry when using result()', async () => {
      const params = { parameterKey: 'alpha' };

      await new Try(throwingFunction, params)
        .debug(false)
        .report('should not be reported')
        .result();

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should work with type guards for discriminated union', async () => {
      const params = { parameterKey: 'alpha' };

      const result = await new Try(successfulFunction, params).result();

      if (result.success) {
        expect(result.value).toEqual({ ok: true, ...params });
        // TypeScript should know that result.error doesn't exist here
        expect('error' in result).toBe(false);
      } else {
        // This branch shouldn't execute for successful function
        expect(true).toBe(false);
      }
    });

    it('should work with destructuring', async () => {
      const params = { parameterKey: 'alpha' };

      const result = await new Try(throwingFunction, params)
        .debug(false)
        .result();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('boom');
        // TypeScript should know that result.value doesn't exist here
        expect('value' in result).toBe(false);
      }
    });

    it('should execute finally callbacks when using result()', async () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();

      const result = await new Try(successfulFunction, params)
        .finally(finallySpy)
        .result();

      expect(result.success).toBe(true);
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should cache results on subsequent calls', async () => {
      const params = { parameterKey: 'alpha' };
      const fnSpy = vi.fn().mockResolvedValue({ cached: true });

      const tryInstance = new Try(fnSpy, params);
      
      const result1 = await tryInstance.result();
      const result2 = await tryInstance.result();

      expect(fnSpy).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2); // Same object reference
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.value).toEqual({ cached: true });
      }
    });

    it('should work with async finally callbacks', async () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();
      let asyncCallbackResolved = false;
      
      const asyncFinally = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        asyncCallbackResolved = true;
        finallySpy();
      };

      const result = await new Try(successfulFunction, params)
        .finally(asyncFinally)
        .result();

      expect(result.success).toBe(true);
      expect(asyncCallbackResolved).toBe(true);
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should export TryResult type for TypeScript users', async () => {
      const params = { parameterKey: 'alpha' };
      
      // This test verifies that TryResult type is properly exported
      const result: TryResult<{ ok: boolean; }> = await new Try(successfulFunction, params).result();
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ ok: true, ...params });
      }
    });
  });
});
