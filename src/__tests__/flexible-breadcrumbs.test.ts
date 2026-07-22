import { describe, it, expect, vi, afterEach } from 'vitest';
import Try from '../nextjs';
import { BreadcrumbExtractorUtil } from '../utils';

// Mock Sentry SDK
vi.mock('@sentry/nextjs', () => {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
});

import * as Sentry from '@sentry/nextjs';

async function throwingFunction(_params: any): Promise<{ ok: boolean }> {
  throw new Error('boom');
}

describe('Flexible Breadcrumbs System', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Array of keys', () => {
    it('should work with existing breadcrumbs API (object first parameter)', async () => {
      const params = { userId: 123, action: 'update' };

      await new Try(throwingFunction, params)
        .breadcrumbs(['userId', 'action'])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling throwingFunction function',
          data: {
            userId: 123,
            action: 'update',
          },
        }),
      );
    });

    it('should handle empty breadcrumbs array', async () => {
      const params = { userId: 123 };

      await new Try(throwingFunction, params).breadcrumbs([]).value();

      // Empty extracted data should short-circuit the reporter call.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });
  });

  describe('Array Syntax with Extractors', () => {
    it('should extract from multiple parameters using keys', async () => {
      function testFunction(
        order: string,
        customer: { id: number; name: string },
        priority: boolean,
      ) {
        throw new Error('test');
      }

      const customer = { id: 456, name: 'John' };

      await new Try(testFunction, 'order-123', customer, true)
        .breadcrumbs([
          { param: 1, keys: ['id', 'name'] },
          { param: 2, transform: (priority) => ({ priority }) },
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling testFunction function',
          data: {
            id: 456,
            name: 'John',
            priority: true,
          },
        }),
      );
    });

    it('should use custom transformers', async () => {
      function processOrder(orderId: string, amount: number, metadata: any) {
        throw new Error('test');
      }

      await new Try(processOrder, 'order-123', 99.99, {
        tags: ['urgent', 'vip'],
      })
        .breadcrumbs(
          (id: unknown) => ({ orderId: String(id) }),
          (amount: unknown) => ({
            amountCategory: (amount as number) > 100 ? 'large' : 'small',
          }),
          (meta: unknown) => ({
            tagCount: (meta as { tags: string[] }).tags.length,
          }),
        )
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling processOrder function',
          data: {
            orderId: 'order-123',
            amountCategory: 'small',
            tagCount: 2,
          },
        }),
      );
    });

    it('should use predefined transformers', async () => {
      function analyzeData(text: string, numbers: number[], config: object) {
        throw new Error('test');
      }

      await new Try(analyzeData, 'hello world', [1, 2, 3, 4, 5], {
        enabled: true,
        timeout: 5000,
      })
        .breadcrumbs([
          { param: 0, as: 'length' },
          { param: 0, as: 'value' },
          { param: 1, as: 'length' },
          { param: 2, as: 'length' },
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling analyzeData function',
          data: {
            param0_length: 11,
            param0_value: 'hello world',
            param1_length: 5,
            param2_length: 2,
          },
        }),
      );
    });

    it('should handle type transformer', async () => {
      function mixedTypes(
        _str: string,
        _num: number,
        _bool: boolean,
        _obj: object,
        _arr: any[],
      ) {
        throw new Error('test');
      }

      await new Try(mixedTypes, 'test', 42, true, {}, [])
        .breadcrumbs([
          { param: 0, as: 'type' },
          { param: 1, as: 'type' },
          { param: 2, as: 'type' },
          { param: 3, as: 'type' },
          { param: 4, as: 'type' },
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling mixedTypes function',
          data: {
            param0_type: 'string',
            param1_type: 'number',
            param2_type: 'boolean',
            param3_type: 'object',
            param4_type: 'object',
          },
        }),
      );
    });

    it('should handle toString transformer', async () => {
      function processValues(num: number, bool: boolean, obj: object) {
        throw new Error('test');
      }

      await new Try(processValues, 42, true, { name: 'test' })
        .breadcrumbs([
          { param: 0, as: 'toString' },
          { param: 1, as: 'toString' },
          { param: 2, as: 'toString' },
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling processValues function',
          data: {
            param0_string: '42',
            param1_string: 'true',
            param2_string: '[object Object]',
          },
        }),
      );
    });

    it('should handle invalid parameter indices gracefully', async () => {
      function twoParams(a: string, b: number) {
        throw new Error('test');
      }

      await new Try(twoParams, 'hello', 42)
        .breadcrumbs([
          { param: 0, as: 'value' },
          { param: 5, as: 'value' } as any, // Invalid index
          { param: -1, as: 'value' } as any, // Invalid index
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling twoParams function',
          data: {
            param0_value: 'hello',
            // Invalid indices should be ignored
          },
        }),
      );
    });
  });

  describe('Object Syntax Configuration', () => {
    it('should extract using object syntax with parameter indices', async () => {
      function processRequest(
        endpoint: string,
        payload: { userId: number; data: string },
        headers: any,
      ) {
        throw new Error('test');
      }

      await new Try(
        processRequest,
        '/api/users',
        { userId: 123, data: 'test' },
        { 'Content-Type': 'application/json' },
      )
        .breadcrumbs({
          0: (url: string) => ({ endpoint: url }),
          1: ['userId'],
          2: (headers: Record<string, string>) => ({
            headerCount: Object.keys(headers).length,
          }),
        })
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling processRequest function',
          data: {
            endpoint: '/api/users',
            userId: 123,
            headerCount: 1,
          },
        }),
      );
    });

    it('should handle mixed object and array configurations', async () => {
      function complexFunction(
        id: string,
        user: { name: string; age: number },
        settings: any,
      ) {
        throw new Error('test');
      }

      await new Try(
        complexFunction,
        'user-123',
        { name: 'Alice', age: 30 },
        { theme: 'dark', notifications: true },
      )
        .breadcrumbs({
          0: (id: string) => ({ identifier: id.toUpperCase() }),
          1: ['name', 'age'],
          2: (settings: { theme: string; notifications: boolean }) => ({
            settingsCount: Object.keys(settings).length,
          }),
        })
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling complexFunction function',
          data: {
            identifier: 'USER-123',
            name: 'Alice',
            age: 30,
            settingsCount: 2,
          },
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle transformer errors gracefully with debug enabled', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      function testFunction(data: string) {
        throw new Error('test');
      }

      await new Try(testFunction, 'test-data')
        .debug(true)
        .breadcrumbs([
          {
            param: 0,
            transform: () => {
              throw new Error('transformer error');
            },
          },
        ])
        .value();

      expect(warnSpy).toHaveBeenCalledWith(
        '[try-catch] breadcrumb transformer threw; breadcrumb dropped:',
        expect.any(Error),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in breadcrumb transformer:',
        expect.any(Error),
      );
      // Transformer error yields empty data — reporter call is short-circuited.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should always warn on transformer errors even with debug disabled', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      function testFunction(data: string) {
        throw new Error('test');
      }

      await new Try(testFunction, 'test-data')
        .breadcrumbs([
          {
            param: 0,
            transform: () => {
              throw new Error('transformer error');
            },
          },
        ])
        .value();

      expect(warnSpy).toHaveBeenCalledWith(
        '[try-catch] breadcrumb transformer threw; breadcrumb dropped:',
        expect.any(Error),
      );
      expect(errorSpy).not.toHaveBeenCalled();
      // Transformer error yields empty data — reporter call is short-circuited.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should handle predefined transformer errors gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      function testFunction(data: any) {
        throw new Error('test');
      }

      const problematicValue = {
        toString: () => {
          throw new Error('toString error');
        },
      };

      await new Try(testFunction, problematicValue)
        .debug(true)
        .breadcrumbs([{ param: 0, as: 'toString' }])
        .value();

      expect(warnSpy).toHaveBeenCalledWith(
        '[try-catch] predefined breadcrumb transformer threw; breadcrumb dropped:',
        expect.any(Error),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in predefined transformer:',
        expect.any(Error),
      );
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should handle non-object parameters for key extraction gracefully', async () => {
      function testFunction(primitiveParam: string) {
        throw new Error('test');
      }

      await new Try(testFunction, 'not-an-object')
        .breadcrumbs([{ param: 0, keys: ['nonExistentKey'] } as any])
        .value();

      // No keys extracted from a primitive — reporter call is short-circuited.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined and null values', async () => {
      function testFunction(a: any, b: any, c: any) {
        throw new Error('test');
      }

      await new Try(testFunction, undefined, null, '')
        .breadcrumbs([
          { param: 0, as: 'value' },
          { param: 1, as: 'value' },
          { param: 2, as: 'length' },
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling testFunction function',
          data: {
            param0_value: undefined,
            param1_value: null,
            param2_length: 0,
          },
        }),
      );
    });

    it('should handle empty configuration', async () => {
      function testFunction(data: string) {
        throw new Error('test');
      }

      await new Try(testFunction, 'test').debug(false).breadcrumbs([]).value();

      // Empty config yields empty data — reporter call is short-circuited.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should handle mixed valid and invalid extractors', async () => {
      function testFunction(a: string, b: { key: string }) {
        throw new Error('test');
      }

      await new Try(testFunction, 'valid', { key: 'value' })
        .breadcrumbs([
          { param: 0, as: 'value' }, // Valid
          { param: 10, as: 'value' }, // Invalid param index
          { param: 1, keys: ['key'] }, // Valid
          { param: 0, keys: ['invalidKey'] } as any, // Valid param, but key extraction from string will fail
        ])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling testFunction function',
          data: {
            param0_value: 'valid',
            key: 'value',
            // Invalid entries should be ignored
          },
        }),
      );
    });

    it('should filter out undefined values from key extraction', async () => {
      function testFunction(obj: { a: string; b?: string; c: undefined }) {
        throw new Error('test');
      }

      const payload: { a: string; b?: string; c: undefined } = {
        a: 'defined',
        c: undefined,
      };

      await new Try(testFunction, payload)
        .breadcrumbs([{ param: 0, keys: ['a', 'b', 'c'] }])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling testFunction function',
          data: {
            a: 'defined',
            // b and c should be filtered out (missing and undefined)
          },
        }),
      );
    });

    it('positional string handler drops undefined values', async () => {
      function testFunction(a?: string, b?: number, c?: boolean) {
        throw new Error('test');
      }

      // Mix positional strings with an extractor so config exercises
      // extractFromArray's positional-string branch (not extractFromKeys).
      await new Try(testFunction, 'defined', undefined, true)
        .breadcrumbs(['a', 'b', { param: 2, as: 'value' }])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling testFunction function',
          data: {
            a: 'defined',
            param2_value: true,
            // b should be filtered out (undefined positional value)
          },
        }),
      );
    });

    it('should work with functions that have no parameters', async () => {
      function noParams() {
        throw new Error('test');
      }

      await new Try(noParams).debug(false).breadcrumbs([]).value();

      // No data extracted — reporter call is short-circuited.
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should handle anonymous functions properly', async () => {
      /* prettier-ignore */
      await new Try(
        (_data: string) => { throw new Error('test'); },
        'test'
      )
        .breadcrumbs([{ param: 0, as: 'value' }])
        .value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Calling anonymous function',
          data: {
            param0_value: 'test',
          },
        }),
      );
    });
  });

  describe('Performance and Caching', () => {
    it('should only execute breadcrumb extraction once per Try instance', async () => {
      const transformSpy = vi.fn((value) => ({ transformed: value }));

      function testFunction(data: string) {
        throw new Error('test');
      }

      const tryInstance = new Try(testFunction, 'test-data').breadcrumbs([
        { param: 0, transform: transformSpy },
      ]);

      // Execute multiple times
      await tryInstance.value();
      await tryInstance.value();
      await tryInstance.error();

      // Transform should only be called once due to caching
      expect(transformSpy).toHaveBeenCalledTimes(1);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    });

    it('child inherits breadcrumb config set before .default()', async () => {
      const params = { userId: 123, action: 'update' };

      // breadcrumbs configured before default() — not overridden after
      const result = await new Try(throwingFunction, params)
        .breadcrumbs(['userId', 'action'])
        .default({ ok: false })
        .value();

      expect(result).toEqual({ ok: false });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 123, action: 'update' },
        }),
      );
    });

    it('parent and child (via .default()) can have divergent breadcrumb configs', async () => {
      const params = { userId: 123, action: 'update', role: 'admin' };

      const parent = new Try(throwingFunction, params).breadcrumbs([
        'userId',
        'action',
      ]);
      const child = parent.default({ ok: false }).breadcrumbs(['role']);

      // Parent runs first and caches its breadcrumbs.
      await parent.value();
      await child.value();

      expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
      expect(Sentry.addBreadcrumb).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: { userId: 123, action: 'update' },
        }),
      );
      expect(Sentry.addBreadcrumb).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { role: 'admin' },
        }),
      );
    });
  });

  describe('Empty breadcrumb data idempotence', () => {
    it('empty breadcrumb data does not re-extract on subsequent terminals', async () => {
      const extractSpy = vi.spyOn(BreadcrumbExtractorUtil, 'extract');
      const fn = async () => {
        throw new Error('boom');
      };

      const t = new Try(fn).breadcrumbs(['nonexistent'] as never);
      await t.value();
      await t.unwrap().catch(() => {});
      await t.result();

      // Extractor should run at most once for a given (exec, config) pair.
      expect(extractSpy).toHaveBeenCalledTimes(1);
      extractSpy.mockRestore();
    });
  });
});
