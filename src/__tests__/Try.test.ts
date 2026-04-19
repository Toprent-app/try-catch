import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

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
      expect(Sentry.captureException).not.toHaveBeenCalled();
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
      expect(Sentry.captureException).not.toHaveBeenCalled();
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

  describe('Promise-returning non-async functions', () => {
    it('non-async fn returning a Promise is NOT thenable', () => {
      function returnsPromise(): Promise<number> {
        return Promise.resolve(42);
      }

      const t = new Try(returnsPromise);
      expect('then' in t).toBe(false);
    });

    it('await on non-async Try does not execute the wrapped fn (no side effects)', async () => {
      let calls = 0;
      function returnsPromise(): Promise<number> {
        calls += 1;
        return Promise.resolve(42);
      }

      const t = new Try(returnsPromise);
      const awaited = await t;

      expect(awaited).toBe(t);
      expect(calls).toBe(0);
    });

    it('Promise-returning sync fn is consumed via .unwrap() / .value()', async () => {
      function returnsPromise(): Promise<number> {
        return Promise.resolve(42);
      }
      function returnsRejectedPromise(): Promise<number> {
        return Promise.reject(new Error('boom'));
      }

      await expect(new Try(returnsPromise).unwrap()).resolves.toBe(42);
      await expect(
        new Try(returnsRejectedPromise).default(-1).value(),
      ).resolves.toBe(-1);
    });

    it('await still yields the Try instance for truly synchronous fn', async () => {
      function syncFn(): number {
        return 42;
      }

      const t = new Try(syncFn);
      const awaited = await t;

      expect(awaited).toBe(t);
    });
  });

  describe('.default() shares exec state with parent', () => {
    it('does not re-invoke fn when both parent and child are read', async () => {
      const fn = vi.fn(async (n: number) => n * 2);

      const parent = new Try(fn, 5);
      const child = parent.default(-1);

      const parentValue = await parent.value();
      const childValue = await child.value();

      expect(parentValue).toBe(10);
      expect(childValue).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('child returns parent.value() on success even when default is set', async () => {
      const fn = vi.fn((n: number) => n + 1);

      const parent = new Try(fn, 41);
      const child = parent.default(-1);

      expect(child.value()).toBe(42);
      expect(parent.value()).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('child default value is used when parent fn throws (sync)', () => {
      const fn = vi.fn((_n: number) => {
        throw new Error('boom');
      });

      const parent = new Try(fn, 1);
      const child = parent.default('fallback');

      expect(child.value()).toBe('fallback');
      // Trigger parent; should reuse cached error result without re-running fn.
      expect(parent.value()).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('child default value is used when parent fn rejects (async)', async () => {
      const fn = vi.fn(async (_n: number) => {
        throw new Error('boom');
      });

      const parent = new Try(fn, 1);
      const child = parent.default('fallback');

      await expect(child.value()).resolves.toBe('fallback');
      await expect(parent.value()).resolves.toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-Error normalization (DIAG-01)', () => {
    it('sync: thrown string is normalized to Error with cause', async () => {
      const result = new Try(() => { throw 'oops'; }).result();
      expect(result).not.toBeInstanceOf(Promise);
      const r = result as { success: false; error: Error };
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe('Non-Error thrown (string)');
      expect(r.error.cause).toBe('oops');
    });

    it('sync: thrown number is normalized to Error with cause', () => {
      const result = new Try(() => { throw 42; }).result();
      const r = result as { success: false; error: Error };
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe('Non-Error thrown (number)');
      expect(r.error.cause).toBe(42);
    });

    it('sync: thrown plain object is normalized to Error with cause', () => {
      const obj = { code: 42 };
      const result = new Try(() => { throw obj; }).result();
      const r = result as { success: false; error: Error };
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe('Non-Error thrown (object)');
      expect(r.error.cause).toBe(obj);
    });

    it('async: rejected string is normalized to Error with cause', async () => {
      const result = await new Try(async () => { throw 'oops'; }).result();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe('Non-Error thrown (string)');
        expect(result.error.cause).toBe('oops');
      }
    });

    it('sync: real Error passes through unchanged (no re-wrap)', () => {
      const real = new Error('real');
      const result = new Try(() => { throw real; }).result();
      const r = result as { success: false; error: Error };
      expect(r.error).toBe(real);
      expect(r.error.message).toBe('real');
    });

    it('async: real Error passes through unchanged', async () => {
      const real = new Error('real');
      const result = await new Try(async () => { throw real; }).result();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(real);
        expect(result.error.message).toBe('real');
      }
    });
  });

  describe('breadcrumb consistency (SENT-03, D-06)', () => {
    let mockAddBreadcrumbs: ReturnType<typeof vi.fn>;
    let savedReporter: import('../core/reporter').Reporter;

    beforeEach(() => {
      savedReporter = Try.getDefaultReporter();
      mockAddBreadcrumbs = vi.fn();
      Try.setDefaultReporter({
        report: vi.fn(),
        addBreadcrumbs: mockAddBreadcrumbs,
        createWrappedError: (error: Error, message: string) => {
          const w = new Error(message);
          w.cause = error;
          w.stack = error.stack;
          return w;
        },
      });
    });

    afterEach(() => {
      Try.setDefaultReporter(savedReporter);
    });

    it('async unwrap: breadcrumbs called once when .breadcrumbs() configured', async () => {
      await expect(
        new Try(async (_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
          .breadcrumbs(['x'])
          .unwrap()
      ).rejects.toThrow('boom');
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
    });

    it('sync unwrap: breadcrumbs called once when .breadcrumbs() configured', () => {
      expect(() =>
        new Try((_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
          .breadcrumbs(['x'])
          .unwrap()
      ).toThrow('boom');
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
    });

    it('async error(): breadcrumbs called once; returns normalized Error', async () => {
      const err = await new Try(async (_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
        .breadcrumbs(['x'])
        .error();
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(Error);
    });

    it('sync error(): breadcrumbs called once; returns normalized Error', () => {
      const err = new Try((_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
        .breadcrumbs(['x'])
        .error();
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(Error);
    });

    it('result(): breadcrumbs called once on failure', async () => {
      const r = await new Try(async (_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
        .breadcrumbs(['x'])
        .result();
      expect(r.success).toBe(false);
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
    });

    it('.report().breadcrumbs(): addBreadcrumbs called exactly once total (no double-add)', async () => {
      await expect(
        new Try(async (_p: { x: number }) => { throw new Error('boom'); }, { x: 1 })
          .report('msg')
          .breadcrumbs(['x'])
          .unwrap()
      ).rejects.toThrow();
      expect(mockAddBreadcrumbs).toHaveBeenCalledTimes(1);
    });

    it('no .breadcrumbs(): addBreadcrumbs NEVER called', async () => {
      await new Try(async () => { throw new Error('boom'); }).result();
      expect(mockAddBreadcrumbs).not.toHaveBeenCalled();
    });
  });
});
