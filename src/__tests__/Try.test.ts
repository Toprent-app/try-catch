import { describe, it, expect, vi, afterEach } from 'vitest';

import Try from '../nextjs';

// Mock Sentry SDK
vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

import * as Sentry from '@sentry/nextjs';
import type { TryResult } from '..';

class GraphQLError extends Error {
  name = 'GraphQLError';
}

class TestClass {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  async greet({ greeting }: { greeting: string }) {
    return `${greeting}, I'm ${this.name}`;
  }

  greetSync({ greeting }: { greeting: string }) {
    return `${greeting}, I'm ${this.name}`;
  }
}

describe('Try', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    Try.throwThroughErrorTypes([]);
  });

  describe('async', () => {
    async function throwingFunction(
      _params: Record<string, unknown>,
    ): Promise<{ ok: boolean }> {
      throw new Error('boom');
    }

    async function throwingCustomError(
      _params: Record<string, unknown>,
    ): Promise<{ ok: boolean }> {
      throw new GraphQLError('validation error');
    }

    async function successfulFunction(
      params: Record<string, unknown>,
    ): Promise<{ ok: boolean }> {
      return { ok: true, ...params };
    }

    function returnsPromiseOrThrows(shouldThrow: boolean): Promise<string> {
      if (shouldThrow) {
        return Promise.reject(new Error('boom'));
      }

      return Promise.resolve('ok');
    }

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

      const exec = new Try(throwingFunction, params).debug(false).unwrap();

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

      const result = await new Try(successfulFunction, params).value();

      expect(result).toEqual({ ok: true, ...params });
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    describe('sync return behavior', () => {
      it('returns sync value immediately (no Promise)', () => {
        const result = new Try(() => 'ok').value();

        expect(result).toBe('ok');
        expect(result).not.toBeInstanceOf(Promise);
      });

      it('returns default value on sync error', () => {
        const result = new Try(() => {
          throw new Error('boom');
        })
          .default('fallback')
          .value();

        expect(result).toBe('fallback');
      });

      it('captures sync error for error() and result()', () => {
        const error = new Try(() => {
          throw new Error('boom');
        }).error();

        const result = new Try(() => {
          throw new Error('boom');
        }).result();

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('boom');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toBe('boom');
        }
      });

      it('throws on unwrap for sync error', () => {
        expect(() =>
          new Try(() => {
            throw new Error('boom');
          }).unwrap(),
        ).toThrow('boom');
      });

      it('runs finally immediately for sync path and returns Try instance', () => {
        const finallySpy = vi.fn();
        const tryInstance = new Try(() => 'ok');

        const chained = tryInstance.finally(finallySpy);
        const value = tryInstance.value();

        expect(chained).toBe(tryInstance);
        expect(value).toBe('ok');
        expect(finallySpy).toHaveBeenCalledTimes(1);
      });
    });

    it('treats promise-returning functions as async even when they throw', async () => {
      const valuePromise = new Try(returnsPromiseOrThrows, true).value();

      expect(valuePromise).toBeInstanceOf(Promise);
      await expect(valuePromise).resolves.toBeUndefined();

      const errorPromise = new Try(returnsPromiseOrThrows, true).error();

      expect(errorPromise).toBeInstanceOf(Promise);
      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('boom');
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

      const exec = new Try(throwingFunction, params).debug(false).unwrap();

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
            parameterKey: 'alpha',
          },
        }),
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

      const result = await new Try(newTest.greet.bind(newTest), {
        greeting,
      }).unwrap();

      expect(result).toEqual("Hi!, I'm newTest");
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
        },
      });
    });

    it('should add multiple tags at once', async () => {
      const params = { parameterKey: 'alpha' };

      const exec = new Try(throwingFunction, params)
        .debug(false)
        .report('failed')
        .tags({
          component: 'payment-service',
          operation: 'charge-card',
          gateway: 'stripe',
          version: '2.1.0',
        })
        .unwrap();

      await expect(exec).rejects.toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          component: 'payment-service',
          operation: 'charge-card',
          gateway: 'stripe',
          version: '2.1.0',
        },
      });
    });

    it('should combine tags() with individual tag() calls', async () => {
      const params = { parameterKey: 'alpha' };

      const exec = new Try(throwingFunction, params)
        .debug(false)
        .report('failed')
        .tags({ module: 'data-processor', version: '1.0' })
        .tag('requestId', 'req-123')
        .tag('userId', 'user-456')
        .unwrap();

      await expect(exec).rejects.toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          module: 'data-processor',
          version: '1.0',
          requestId: 'req-123',
          userId: 'user-456',
        },
      });
    });

    it('should override tags when using tags() multiple times', async () => {
      const params = { parameterKey: 'alpha' };

      const exec = new Try(throwingFunction, params)
        .debug(false)
        .report('failed')
        .tags({ version: '1.0', env: 'prod' })
        .tags({ version: '2.0', component: 'api' }) // version should be overridden
        .unwrap();

      await expect(exec).rejects.toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          version: '2.0', // overridden value
          env: 'prod',
          component: 'api',
        },
      });
    });

    it('should handle empty tags object', async () => {
      const params = { parameterKey: 'alpha' };

      const exec = new Try(throwingFunction, params)
        .debug(false)
        .report('failed')
        .tags({}) // empty object should work
        .tag('single', 'tag')
        .unwrap();

      await expect(exec).rejects.toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          single: 'tag',
        },
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

      await new Try(successfulFunction, params).finally(finallySpy).unwrap();

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
      async function greet(name: string, greeting: string = 'Hello') {
        return `${greeting}, ${name}!`;
      }

      const result = await new Try(greet, 'Alice', 'Hi').value();
      expect(result).toBe('Hi, Alice!');
    });

    it('should work with number parameters', async () => {
      async function add(a: number, b: number) {
        return a + b;
      }

      const result = await new Try(add, 5, 3).unwrap();
      expect(result).toBe(8);
    });

    it('should work with mixed parameter types', async () => {
      async function formatMessage(
        id: number,
        message: string,
        urgent: boolean,
      ) {
        const prefix = urgent ? '[URGENT]' : '[INFO]';
        return `${prefix} #${id}: ${message}`;
      }

      const result = await new Try(
        formatMessage,
        123,
        'Test message',
        true,
      ).value();
      expect(result).toBe('[URGENT] #123: Test message');
    });

    it('should work with no parameters', async () => {
      async function getCurrentTime() {
        return Date.now();
      }

      const result = await new Try(getCurrentTime).value();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should not allow breadcrumbs with non-object first parameter', async () => {
      async function processString(str: string) {
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
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      await new Try(throwingFunction, params).debug(false).value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log errors when debug is enabled', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      await new Try(throwingFunction, params).debug().value();

      expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
      consoleSpy.mockRestore();
    });

    it('should not log errors when debug is explicitly disabled', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      await new Try(throwingFunction, params).debug(false).value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log finally callback errors when debug is enabled', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const throwingFinally = () => {
        throw new Error('finally error');
      };

      await new Try(successfulFunction, params)
        .debug()
        .finally(throwingFinally)
        .value();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in finally callback',
        new Error('finally error'),
      );
      consoleSpy.mockRestore();
    });

    it('should not log finally callback errors when debug is disabled', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const throwingFinally = () => {
        throw new Error('finally error');
      };

      await new Try(successfulFunction, params)
        .finally(throwingFinally)
        .value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should support conditional debug logging', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const isDevelopment = true;

      await new Try(throwingFunction, params).debug(isDevelopment).value();

      expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
      consoleSpy.mockRestore();
    });

    it('should include function name in breadcrumbs for anonymous functions', async () => {
      const params = { parameterKey: 'beta' };

      await new Try(async (_data: Record<string, unknown>) => {
        throw new Error('anonymous error');
      }, params)
        .debug(false)
        .breadcrumbs(['parameterKey'])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling anonymous function',
          data: {
            parameterKey: 'beta',
          },
        }),
      );
    });

    it('should await async finally callbacks', async () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();
      let asyncCallbackResolved = false;

      const asyncFinally = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        asyncCallbackResolved = true;
        finallySpy();
      };

      await new Try(successfulFunction, params).finally(asyncFinally).unwrap();

      expect(asyncCallbackResolved).toBe(true);
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should await async finally callbacks on error', async () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();
      let asyncCallbackResolved = false;

      const asyncFinally = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
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
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      const throwingAsyncFinally = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('async finally error');
      };

      await new Try(successfulFunction, params)
        .debug()
        .finally(throwingAsyncFinally)
        .value();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in finally callback',
        new Error('async finally error'),
      );
      consoleSpy.mockRestore();
    });

    it('should handle async finally callback errors without debug', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      const throwingAsyncFinally = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
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
          value: { ok: true, ...params },
        });
      });

      it('should return error result object', async () => {
        const params = { parameterKey: 'alpha' };

        const result = await new Try(throwingFunction, params)
          .debug(false)
          .result();

        expect(result).toEqual({
          success: false,
          error: new Error('boom'),
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
          await new Promise((resolve) => setTimeout(resolve, 10));
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
        const result: TryResult<{ ok: boolean }> = await new Try(
          successfulFunction,
          params,
        ).result();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toEqual({ ok: true, ...params });
        }
      });
    });

    describe('tags() method with different execution modes', () => {
      it('should work with .value() method', async () => {
        const params = { parameterKey: 'alpha' };

        const result = await new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({ component: 'test', version: '1.0' })
          .value();

        expect(result).toBe(undefined);

        const expectedError = new Error('failed');
        expectedError.cause = new Error('boom');

        expect(Sentry.captureException).toBeCalledWith(expectedError, {
          tags: {
            library: '@power-rent/try-catch',
            component: 'test',
            version: '1.0',
          },
        });
      });

      it('should work with .result() method', async () => {
        const params = { parameterKey: 'alpha' };

        const result = await new Try(successfulFunction, params)
          .tags({ component: 'test', version: '1.0' })
          .result();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toEqual({ ok: true, ...params });
        }

        // tags() with .result() should not report to Sentry
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('should support method chaining in any order', async () => {
        const params = { parameterKey: 'alpha' };

        const exec = new Try(throwingFunction, params)
          .tags({ component: 'payment' })
          .debug(false)
          .tag('operation', 'charge')
          .report('failed')
          .tags({ version: '2.0' })
          .unwrap();

        await expect(exec).rejects.toThrow('failed');

        const expectedError = new Error('failed');
        expectedError.cause = new Error('boom');

        expect(Sentry.captureException).toBeCalledWith(expectedError, {
          tags: {
            library: '@power-rent/try-catch',
            component: 'payment',
            operation: 'charge',
            version: '2.0',
          },
        });
      });
    });
  });

  describe('sync', () => {
    function throwingFunction(_params: Record<string, unknown>): {
      ok: boolean;
    } {
      throw new Error('boom');
    }

    function throwingCustomError(_params: Record<string, unknown>): {
      ok: boolean;
    } {
      throw new GraphQLError('validation error');
    }

    function successfulFunction(params: Record<string, unknown>): {
      ok: boolean;
    } {
      return { ok: true, ...params };
    }

    it('should return default value', () => {
      const defaultVal = { value: 'fallback' };
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      const result = new Try(throwingFunction, params)
        .debug(false)
        .default(defaultVal)
        .value();

      expect(result).toBe(defaultVal);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should work without parameters', () => {
      const defaultVal = { value: 'fallback' };

      const result = new Try(() => false).default(defaultVal).value();

      expect(result).toBe(false);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should return default value and report error', () => {
      const defaultVal = { value: 'fallback' };
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      const result = new Try(throwingFunction, params)
        .debug(false)
        .report('failed to get data')
        .default(defaultVal)
        .value();

      expect(result).toBe(defaultVal);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should rethrow error', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      expect(() => {
        new Try(throwingFunction, params).debug(false).unwrap();
      }).toThrow('boom');
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should return undefined', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      const result = new Try(throwingFunction, params).debug(false).value();

      expect(result).toBe(undefined);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should return the value', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      const result = new Try(successfulFunction, params).value();

      expect(result).toEqual({ ok: true, ...params });
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    describe('sync return behavior', () => {
      it('returns sync value immediately (no Promise)', () => {
        const result = new Try(() => 'ok').value();

        expect(result).toBe('ok');
        expect(result).not.toBeInstanceOf(Promise);
      });

      it('returns default value on sync error', () => {
        const result = new Try(() => {
          throw new Error('boom');
        })
          .default('fallback')
          .value();

        expect(result).toBe('fallback');
      });

      it('captures sync error for error() and result()', () => {
        const error = new Try(() => {
          throw new Error('boom');
        }).error();

        const result = new Try(() => {
          throw new Error('boom');
        }).result();

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('boom');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toBe('boom');
        }
      });

      it('throws on unwrap for sync error', () => {
        expect(() =>
          new Try(() => {
            throw new Error('boom');
          }).unwrap(),
        ).toThrow('boom');
      });

      it('runs finally immediately for sync path and returns Try instance', () => {
        const finallySpy = vi.fn();
        const tryInstance = new Try(() => 'ok');

        const chained = tryInstance.finally(finallySpy);
        const value = tryInstance.value();

        expect(chained).toBe(tryInstance);
        expect(value).toBe('ok');
        expect(finallySpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw an error', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      expect(() => {
        new Try(throwingFunction, params).report('failed').unwrap();
      }).toThrow('failed');
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('should throw the original error', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      expect(() => {
        new Try(throwingFunction, params).unwrap();
      }).toThrow('boom');
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should send breadcrumbs', () => {
      const params = { parameterKey: 'alpha', parameterKey1: 'beta' };

      new Try(throwingFunction, params)
        .debug(false)
        .breadcrumbs(['parameterKey'])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling throwingFunction function',
          data: {
            parameterKey: 'alpha',
          },
        }),
      );
    });

    it('should return the function result', () => {
      const params = { parameterKey: 'alpha' };

      const result = new Try(successfulFunction, params).unwrap();

      expect(result).toEqual({ ok: true, ...params });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should return a class method result', () => {
      const greeting = 'Hi!';
      const newTest = new TestClass('newTest');

      const result = new Try(newTest.greetSync.bind(newTest), {
        greeting,
      }).unwrap();

      expect(result).toEqual("Hi!, I'm newTest");
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should add tags', () => {
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tag('name', 'value')
          .tag('test', 'true')
          .unwrap();
      }).toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          name: 'value',
          test: 'true',
        },
      });
    });

    it('should add multiple tags at once', () => {
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({
            component: 'payment-service',
            operation: 'charge-card',
            gateway: 'stripe',
            version: '2.1.0',
          })
          .unwrap();
      }).toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          component: 'payment-service',
          operation: 'charge-card',
          gateway: 'stripe',
          version: '2.1.0',
        },
      });
    });

    it('should combine tags() with individual tag() calls', () => {
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({ module: 'data-processor', version: '1.0' })
          .tag('requestId', 'req-123')
          .tag('userId', 'user-456')
          .unwrap();
      }).toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          module: 'data-processor',
          version: '1.0',
          requestId: 'req-123',
          userId: 'user-456',
        },
      });
    });

    it('should override tags when using tags() multiple times', () => {
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({ version: '1.0', env: 'prod' })
          .tags({ version: '2.0', component: 'api' }) // version should be overridden
          .unwrap();
      }).toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          version: '2.0', // overridden value
          env: 'prod',
          component: 'api',
        },
      });
    });

    it('should handle empty tags object', () => {
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({}) // empty object should work
          .tag('single', 'tag')
          .unwrap();
      }).toThrow('failed');

      const expectedError = new Error('failed');
      expectedError.cause = new Error('boom');

      expect(Sentry.captureException).toBeCalledWith(expectedError, {
        tags: {
          library: '@power-rent/try-catch',
          single: 'tag',
        },
      });
    });

    it('should return the actual error', () => {
      const params = { parameterKey: 'alpha' };

      const result = new Try(throwingFunction, params).debug(false).error();

      expect(result).toEqual(new Error('boom'));
    });

    it('should return the actual error', () => {
      Try.throwThroughErrorTypes(['GraphQLError']);
      const params = { parameterKey: 'alpha' };

      expect(() => {
        new Try(throwingCustomError, params)
          .debug(false)
          .report('failed')
          .unwrap();
      }).toThrow('validation error');
    });

    it('should not give typescript error', () => {
      const params = { parameterKey: 'alpha' };

      const result = new Try(throwingFunction, params)
        .debug(false)
        .default({ ok: true })
        .value();

      expect(result).not.toBe(undefined);
      expect(() => result.ok).not.toThrow(TypeError);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should execute finally callback on success', () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();

      new Try(successfulFunction, params).finally(finallySpy).unwrap();

      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should execute finally callback on error', () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .finally(finallySpy)
          .unwrap();
      }).toThrow('boom');
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should work with string parameters', () => {
      function greet(name: string, greeting: string = 'Hello') {
        return `${greeting}, ${name}!`;
      }

      const result = new Try(greet, 'Alice', 'Hi').value();
      expect(result).toBe('Hi, Alice!');
    });

    it('should work with number parameters', () => {
      function add(a: number, b: number): number {
        return a + b;
      }

      const result = new Try(add, 5, 3).unwrap();
      expect(result).toBe(8);
    });

    it('should work with mixed parameter types', () => {
      function formatMessage(
        id: number,
        message: string,
        urgent: boolean,
      ): string {
        const prefix = urgent ? '[URGENT]' : '[INFO]';
        return `${prefix} #${id}: ${message}`;
      }

      const result = new Try(formatMessage, 123, 'Test message', true).value();
      expect(result).toBe('[URGENT] #123: Test message');
    });

    it('should work with no parameters', () => {
      function getCurrentTime(): number {
        return Date.now();
      }

      const result = new Try(getCurrentTime).value();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should not allow breadcrumbs with non-object first parameter', () => {
      function processString(str: string): string {
        return str.toUpperCase();
      }

      // This should show a TypeScript error if breadcrumbs is called with non-object parameter
      const tryInstance = new Try(processString, 'hello');

      // Test that it still works without breadcrumbs
      const result = tryInstance
        .report('String processing failed')
        .tag('operation', 'uppercase')
        .value();

      expect(result).toBe('HELLO');
    });

    it('should not log errors by default', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      new Try(throwingFunction, params).debug(false).value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log errors when debug is enabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      new Try(throwingFunction, params).debug().value();

      expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
      consoleSpy.mockRestore();
    });

    it('should not log errors when debug is explicitly disabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      new Try(throwingFunction, params).debug(false).value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log finally callback errors when debug is enabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const throwingFinally = () => {
        throw new Error('finally error');
      };

      new Try(successfulFunction, params)
        .debug()
        .finally(throwingFinally)
        .value();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in finally callback',
        new Error('finally error'),
      );
      consoleSpy.mockRestore();
    });

    it('should not log finally callback errors when debug is disabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const throwingFinally = () => {
        throw new Error('finally error');
      };

      new Try(successfulFunction, params).finally(throwingFinally).value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should support conditional debug logging', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };
      const isDevelopment = true;

      new Try(throwingFunction, params).debug(isDevelopment).value();

      expect(consoleSpy).toHaveBeenCalledWith(new Error('boom'));
      consoleSpy.mockRestore();
    });

    it('should include function name in breadcrumbs for anonymous functions', () => {
      const params = { parameterKey: 'beta' };

      new Try((_data: Record<string, unknown>) => {
        throw new Error('anonymous error');
      }, params)
        .debug(false)
        .breadcrumbs(['parameterKey'])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling anonymous function',
          data: {
            parameterKey: 'beta',
          },
        }),
      );
    });

    it('should async finally callbacks', () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();
      let asyncCallbackResolved = false;

      const asyncFinally = () => {
        new Promise((resolve) => setTimeout(resolve, 10));
        asyncCallbackResolved = true;
        finallySpy();
      };

      new Try(successfulFunction, params).finally(asyncFinally).unwrap();

      expect(asyncCallbackResolved).toBe(true);
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should async finally callbacks on error', () => {
      const params = { parameterKey: 'alpha' };
      const finallySpy = vi.fn();
      let asyncCallbackResolved = false;

      const asyncFinally = () => {
        new Promise((resolve) => setTimeout(resolve, 10));
        asyncCallbackResolved = true;
        finallySpy();
      };

      expect(() => {
        new Try(throwingFunction, params)
          .debug(false)
          .finally(asyncFinally)
          .unwrap();
      }).toThrow('boom');
      expect(asyncCallbackResolved).toBe(true);
      expect(finallySpy).toHaveBeenCalledTimes(1);
    });

    it('should handle async finally callback errors', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      const throwingAsyncFinally = () => {
        new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('async finally error');
      };

      new Try(successfulFunction, params)
        .debug()
        .finally(throwingAsyncFinally)
        .value();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in finally callback',
        new Error('async finally error'),
      );
      consoleSpy.mockRestore();
    });

    it('should handle async finally callback errors without debug', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const params = { parameterKey: 'alpha' };

      const throwingAsyncFinally = () => {
        new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('async finally error');
      };

      new Try(successfulFunction, params)
        .debug(false)
        .finally(throwingAsyncFinally)
        .value();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    describe('.result() method', () => {
      it('should return success result object', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(successfulFunction, params).result();

        expect(result).toEqual({
          success: true,
          value: { ok: true, ...params },
        });
      });

      it('should return error result object', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(throwingFunction, params).debug(false).result();

        expect(result).toEqual({
          success: false,
          error: new Error('boom'),
        });
      });

      it('should not report errors to Sentry when using result()', () => {
        const params = { parameterKey: 'alpha' };

        new Try(throwingFunction, params)
          .debug(false)
          .report('should not be reported')
          .result();

        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
      });

      it('should work with type guards for discriminated union', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(successfulFunction, params).result();

        if (result.success) {
          expect(result.value).toEqual({ ok: true, ...params });
          // TypeScript should know that result.error doesn't exist here
          expect('error' in result).toBe(false);
        } else {
          // This branch shouldn't execute for successful function
          expect(true).toBe(false);
        }
      });

      it('should work with destructuring', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(throwingFunction, params).debug(false).result();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toBe('boom');
          // TypeScript should know that result.value doesn't exist here
          expect('value' in result).toBe(false);
        }
      });

      it('should execute finally callbacks when using result()', () => {
        const params = { parameterKey: 'alpha' };
        const finallySpy = vi.fn();

        const result = new Try(successfulFunction, params)
          .finally(finallySpy)
          .result();

        expect(result.success).toBe(true);
        expect(finallySpy).toHaveBeenCalledTimes(1);
      });

      it('should cache results on subsequent calls', () => {
        const params = { parameterKey: 'alpha' } as const;
        const fnSpy = vi.fn((_params) => ({ cached: true }));

        const tryInstance = new Try(fnSpy, params);

        const result1 = tryInstance.result();
        const result2 = tryInstance.result();

        expect(fnSpy).toHaveBeenCalledTimes(1);
        expect(result1).toBe(result2); // Same object reference
        expect(result1.success).toBe(true);
        if (result1.success) {
          expect(result1.value).toEqual({ cached: true });
        }
      });

      it('should export TryResult type for TypeScript users', () => {
        const params = { parameterKey: 'alpha' };

        // This test verifies that TryResult type is properly exported
        const result: TryResult<{ ok: boolean }> = new Try(
          successfulFunction,
          params,
        ).result();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toEqual({ ok: true, ...params });
        }
      });
    });

    describe('tags() method with different execution modes', () => {
      it('should work with .value() method', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(throwingFunction, params)
          .debug(false)
          .report('failed')
          .tags({ component: 'test', version: '1.0' })
          .value();

        expect(result).toBe(undefined);

        const expectedError = new Error('failed');
        expectedError.cause = new Error('boom');

        expect(Sentry.captureException).toBeCalledWith(expectedError, {
          tags: {
            library: '@power-rent/try-catch',
            component: 'test',
            version: '1.0',
          },
        });
      });

      it('should work with .result() method', () => {
        const params = { parameterKey: 'alpha' };

        const result = new Try(successfulFunction, params)
          .tags({ component: 'test', version: '1.0' })
          .result();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toEqual({ ok: true, ...params });
        }

        // tags() with .result() should not report to Sentry
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      it('should support method chaining in any order', () => {
        const params = { parameterKey: 'alpha' };

        expect(() => {
          new Try(throwingFunction, params)
            .tags({ component: 'payment' })
            .debug(false)
            .tag('operation', 'charge')
            .report('failed')
            .tags({ version: '2.0' })
            .unwrap();
        }).toThrow('failed');

        const expectedError = new Error('failed');
        expectedError.cause = new Error('boom');

        expect(Sentry.captureException).toBeCalledWith(expectedError, {
          tags: {
            library: '@power-rent/try-catch',
            component: 'payment',
            operation: 'charge',
            version: '2.0',
          },
        });
      });
    });
  });

  describe('non-Error throwables (type contract + safe normalization)', () => {
    // Sync-throwing fns exercise the synchronous catch path (terminals resolve
    // synchronously); async-throwing fns exercise the Promise-rejection path.
    // Both run the caught value through the same guarded normalizer.
    const throwingSync = (value: unknown) =>
      new Try(() => {
        throw value;
      });
    const throwingAsync = (value: unknown) =>
      new Try(async () => {
        throw value;
      });

    it('normalizes a thrown string to an Error in both sync and async paths', async () => {
      const syncError = throwingSync('sync string').error();
      const asyncError = await throwingAsync('async string').error();
      expect(syncError).toBeInstanceOf(Error);
      expect(syncError?.message).toBe('sync string');
      expect(asyncError).toBeInstanceOf(Error);
      expect(asyncError?.message).toBe('async string');
    });

    it('survives non-stringifiable throwables without re-throwing', async () => {
      // String(Object.create(null)) throws "Cannot convert object to primitive
      // value", and a hostile toString throws too; the guarded normalizer must
      // still yield an Error and the never-throw terminals must not propagate.
      const hostile = {
        toString() {
          throw new Error('toString blew up');
        },
      };

      expect(throwingSync(Object.create(null)).error()).toBeInstanceOf(Error);
      expect(await throwingAsync(hostile).error()).toBeInstanceOf(Error);
      expect(
        throwingSync(Object.create(null)).default('fallback').value(),
      ).toBe('fallback');
    });
  });

  describe('error-like throwables (custom error preservation)', () => {
    const throwingSync = (value: unknown) =>
      new Try(() => {
        throw value;
      });
    const throwingAsync = (value: unknown) =>
      new Try(async () => {
        throw value;
      });

    it('keeps the original instance for same-realm Errors (no reconstruction)', () => {
      const original = new GraphQLError('boom');
      expect(throwingSync(original).error()).toBe(original);
    });

    it('preserves name, message, stack and custom fields of an error-like object', async () => {
      const errorLike = {
        name: 'ValidationError',
        message: 'email is invalid',
        stack: 'ValidationError: email is invalid\n    at origin',
        code: 'E_VALIDATION',
        statusCode: 422,
      };

      for (const error of [
        throwingSync(errorLike).error(),
        await throwingAsync(errorLike).error(),
      ]) {
        expect(error).toBeInstanceOf(Error);
        expect(error?.name).toBe('ValidationError');
        expect(error?.message).toBe('email is invalid');
        expect(error?.stack).toBe(errorLike.stack);
        expect((error as { code?: string }).code).toBe('E_VALIDATION');
        expect((error as { statusCode?: number }).statusCode).toBe(422);
        // Original reachable for debugging / nested cause chains.
        expect(error?.cause).toBe(errorLike);
      }
    });

    it('preserves cross-realm Errors flagged only by their toString tag', () => {
      const crossRealm = {
        [Symbol.toStringTag]: 'Error',
        name: 'RangeError',
        message: 'out of range',
      };
      const error = throwingSync(crossRealm).error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.name).toBe('RangeError');
      expect(error?.message).toBe('out of range');
      expect(error?.cause).toBe(crossRealm);
    });

    it('routes a preserved name through throwThroughErrorTypes', async () => {
      Try.throwThroughErrorTypes(['ValidationError']);
      const errorLike = { name: 'ValidationError', message: 'nope' };

      await expect(
        throwingAsync(errorLike).report('failed').unwrap(),
      ).rejects.toMatchObject({ name: 'ValidationError', message: 'nope' });
    });

    it('never throws on an error-like value whose message getter throws', () => {
      const hostile = {
        name: 'HostileError',
        get message(): string {
          throw new Error('message getter blew up');
        },
      };
      const error = throwingSync(hostile).error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.name).toBe('HostileError');
    });
  });

  describe('hostile throwables — never-throw + Error-contract hardening', () => {
    const throwingSync = (value: unknown) =>
      new Try(() => {
        throw value;
      });
    const throwingAsync = (value: unknown) =>
      new Try(async () => {
        throw value;
      });

    it('never throws on a throwing Symbol.toStringTag getter (sync + async)', async () => {
      // The tag read in isErrorLike invokes the @@toStringTag getter; a hostile
      // one must not escape toError and break the never-throw contract.
      const hostileTagged = {
        name: 'TaggedError',
        message: 'tagged boom',
        get [Symbol.toStringTag](): string {
          throw new Error('toStringTag blew up');
        },
      };
      const syncError = throwingSync(hostileTagged).error();
      const asyncError = await throwingAsync(hostileTagged).error();
      for (const error of [syncError, asyncError]) {
        expect(error).toBeInstanceOf(Error);
        // Falls through the throwing tag to the duck-typed name/message reads.
        expect(error?.name).toBe('TaggedError');
        expect(error?.message).toBe('tagged boom');
      }
    });

    it('never throws when a thrown Proxy traps ownKeys', () => {
      const hostileProxy = new Proxy(
        { name: 'ProxyError', message: 'proxy boom' },
        {
          ownKeys() {
            throw new Error('ownKeys trap blew up');
          },
        },
      );
      const error = throwingSync(hostileProxy).error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.name).toBe('ProxyError');
      expect(error?.message).toBe('proxy boom');
    });

    it('keeps the result instanceof Error when an error-like carries an own __proto__ key', () => {
      // A JSON-deserialized error-like (`throw await res.json()`) carries a real
      // own enumerable `__proto__` key. Copying it by assignment would repoint
      // the new Error's prototype (→ not instanceof Error); the normalizer must
      // skip it and copy benign fields instead.
      const fromJson = JSON.parse(
        '{"name":"DbError","message":"db boom","code":"E_DB","__proto__":{"polluted":true}}',
      );
      const error = throwingSync(fromJson).error();
      expect(error).toBeInstanceOf(Error);
      expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
      expect(error?.name).toBe('DbError');
      expect(error?.message).toBe('db boom');
      expect((error as { code?: string }).code).toBe('E_DB');
      // No global prototype pollution from the malicious key.
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('does not let an own constructor key shadow the Error constructor', () => {
      const fromJson = JSON.parse(
        '{"name":"X","message":"m","constructor":"pwned"}',
      );
      const error = throwingSync(fromJson).error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.constructor).toBe(Error);
    });
  });

  describe('breadcrumbs + report — Next.js double-add regression', () => {
    // The original bug: the nextjs reporter re-added breadcrumbs the core had
    // already added, so a reported failure emitted each breadcrumb twice. This
    // locks in exactly one addBreadcrumb and one captureException per report.
    const reportingAttempt = () =>
      new Try(
        async (_params: { id: number }): Promise<never> => {
          throw new Error('boom');
        },
        { id: 7 },
      )
        .breadcrumbs(['id'])
        .report('failed');
    const expectReportedOnce = () => {
      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    };

    it('adds the breadcrumb exactly once with report on .value()', async () => {
      await reportingAttempt().value();
      expectReportedOnce();
    });

    it('adds the breadcrumb exactly once with report on .unwrap()', async () => {
      await expect(reportingAttempt().unwrap()).rejects.toThrow('failed');
      expectReportedOnce();
    });
  });
});
