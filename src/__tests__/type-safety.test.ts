import { describe, it, expect, expectTypeOf } from 'vitest';

import Try from '../nextjs';

type User = { id: number; name: string };
type Receipt = { id: string; total: number };

const fetchUser = async (params: { id: number }): Promise<User> => {
  return { id: params.id, name: 'Ada' };
};

const chargeCard = async (params: {
  amount: number;
  currency: 'USD' | 'EUR';
}): Promise<Receipt> => {
  return { id: `r-${params.amount}`, total: params.amount };
};

const formatMessage = (id: number, message: string, urgent: boolean) => {
  return urgent ? `[URGENT] #${id}: ${message}` : `[INFO] #${id}: ${message}`;
};

function processRequest(
  endpoint: string,
  payload: { userId: number; data: string },
  headers: any,
) {
  throw new Error('test');
}

describe('Try README type safety', () => {
  it('preserves value() types for sync/async functions', () => {
    const asyncValue = new Try(fetchUser, { id: 123 }).value();
    const syncValue = new Try(formatMessage, 1, 'Test', true).value();

    expectTypeOf(asyncValue).toEqualTypeOf<
      User | undefined | Promise<User | undefined>
    >();
    expectTypeOf(syncValue).toEqualTypeOf<string | undefined>();
  });

  it('narrows value() return when default() is provided', () => {
    const withDefault = new Try(fetchUser, { id: 123 }).default(null).value();
    const syncDefault = new Try(formatMessage, 1, 'Test', true)
      .default('fallback')
      .value();

    expectTypeOf(withDefault).toEqualTypeOf<
      User | null | Promise<User | null>
    >();
    expectTypeOf(syncDefault).toEqualTypeOf<string>();
  });

  it('keeps error() typed as Error | undefined (or MaybePromise for async)', () => {
    const errorValue = new Try(fetchUser, { id: 123 })
      .report('Failed to fetch user')
      .error();
    const syncError = new Try(formatMessage, 1, 'Test', true).error();

    expectTypeOf(errorValue).toEqualTypeOf<
      Error | undefined | Promise<Error | undefined>
    >();
    expectTypeOf(syncError).toEqualTypeOf<Error | undefined>();
  });

  it('keeps unwrap() typed as Awaited<T> (or MaybePromise for async)', () => {
    const receipt = new Try(chargeCard, { amount: 1000, currency: 'USD' })
      .report('Payment failed')
      .unwrap();
    const syncUnwrap = new Try(formatMessage, 1, 'Test', true).unwrap();

    expectTypeOf(receipt).toEqualTypeOf<Receipt | Promise<Receipt>>();
    expectTypeOf(syncUnwrap).toEqualTypeOf<string>();
  });

  it('types Promise-typed sync-throw terminals as MaybePromise unions', () => {
    function syncThrow(): Promise<number> {
      throw new Error('x');
    }

    const attempt = new Try(syncThrow);
    expectTypeOf(attempt.error()).toEqualTypeOf<
      Error | undefined | Promise<Error | undefined>
    >();
    expectTypeOf(attempt.value()).toEqualTypeOf<
      number | undefined | Promise<number | undefined>
    >();
    expectTypeOf(attempt.unwrap).returns.toEqualTypeOf<
      number | Promise<number>
    >();
  });

  it('exposes finally only for fully Promise-like return types', () => {
    const asyncTry = new Try(fetchUser, { id: 123 });
    asyncTry.finally(() => {});

    const chainedAsync = new Try(fetchUser, { id: 123 }).report('x');
    chainedAsync.finally(() => {});

    const syncTry = new Try(formatMessage, 1, 'Test', true);
    // @ts-expect-error finally is absent for pure-sync return types
    syncTry.finally(() => {});

    const chainedSync = new Try(formatMessage, 1, 'Test', true).report('x');
    // @ts-expect-error finally stays absent after fluent chaining
    chainedSync.finally(() => {});

    function maybeAsync(): number | Promise<number> {
      return 1;
    }
    const mixed = new Try(maybeAsync);
    // @ts-expect-error finally is absent for T | Promise<T>
    mixed.finally(() => {});

    expectTypeOf(mixed.value()).toEqualTypeOf<
      number | undefined | Promise<number | undefined>
    >();
  });

  it('known limitation: default() narrowing is discarded by a following fluent method', async () => {
    const failingFetch = async (_params: { id: number }): Promise<User> => {
      throw new Error('boom');
    };

    // `default()` narrows `.value()` on the object it returns.
    expectTypeOf(
      new Try(failingFetch, { id: 123 }).default(null).value(),
    ).toEqualTypeOf<User | null | Promise<User | null>>();

    // A fluent method after it returns `PublicTry<TReturn, TArgs>`, whose
    // `value()` carries `undefined` and drops the default's type.
    const rechained = new Try(failingFetch, { id: 123 })
      .default(null)
      .tag('module', 'payment');

    expectTypeOf(rechained.value()).toEqualTypeOf<
      User | undefined | Promise<User | undefined>
    >();

    // @ts-expect-error known gap: the chained facade omits the default's type
    const _narrowed: User | null | Promise<User | null> = rechained.value();

    // Runtime returns the configured default the static type omits.
    expect(await rechained.value()).toBeNull();
  });

  it('rejects assigning MaybePromise terminals to Promise without await', () => {
    const terminal = new Try(fetchUser, { id: 123 }).value();

    // @ts-expect-error Promise-typed terminals may settle sync
    const _p: Promise<User | undefined> = terminal;

    expectTypeOf(terminal).toEqualTypeOf<
      User | undefined | Promise<User | undefined>
    >();
    expectTypeOf<Awaited<typeof terminal>>().toEqualTypeOf<User | undefined>();
  });

  it('validates breadcrumbs keys against object parameter types', () => {
    const withBreadcrumbs = new Try(fetchUser, { id: 123 }).breadcrumbs(['id']);

    // @ts-expect-error - breadcrumb keys must exist on parameter object
    new Try(fetchUser, { id: 123 }).breadcrumbs(['missingKey']);

    expectTypeOf(withBreadcrumbs.value()).toEqualTypeOf<
      User | undefined | Promise<User | undefined>
    >();
  });

  it('validates breadcrumbs functions parameters against object parameter types', () => {
    new Try(
      processRequest,
      '/api/users',
      { userId: 123, data: 'test' },
      { 'Content-Type': 'application/json' },
    ).breadcrumbs({
      0: (url) => {
        expectTypeOf(url).toEqualTypeOf<string>();
        return { url };
      },
      1: ['userId', 'data'],
      2: (headers) => {
        expectTypeOf(headers).toEqualTypeOf<Record<'Content-Type', string>>();
        return {
          headerCount: Object.keys(headers).length,
        };
      },
    });
  });

  it('rejects invalid argument types', () => {
    // @ts-expect-error - invalid argument types for formatMessage
    new Try(formatMessage, '1', 'Test', true);

    // @ts-expect-error - invalid argument types for chargeCard
    new Try(chargeCard, { amount: '1000', currency: 'USD' });

    expectTypeOf(new Try(formatMessage, 1, 'Test', true).value()).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(
      new Try(chargeCard, { amount: 1000, currency: 'USD' }).value(),
    ).toEqualTypeOf<Receipt | undefined | Promise<Receipt | undefined>>();
  });

  it('should extract from multiple parameters using keys', async () => {
    function testFunction(
      _order: string,
      _customer: { id: number; name: string },
      _priority: boolean,
    ) {
      throw new Error('test');
    }

    const customer = { id: 456, name: 'John' };

    await new Try(testFunction, 'order-123', customer, true)
      .breadcrumbs([
        // @ts-expect-error name is not a valid key of the customer object
        { param: 1, keys: ['id', 'nam'] },
        {
          param: 2,
          transform: (priority) => {
            expectTypeOf(priority).toEqualTypeOf<boolean>();
            return { priority };
          },
        },
      ])
      .value();
  });
});
