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

interface AccountParams {
  accountId: string;
  region: string;
}

type AccountParamsAlias = {
  accountId: string;
  region: string;
};

const loadAccount = async (params: AccountParams): Promise<User> => {
  return { id: 1, name: params.accountId };
};

const loadAccountAlias = async (params: AccountParamsAlias): Promise<User> => {
  return { id: 1, name: params.accountId };
};

const trackVisit = (visitorId: string) => `visit:${visitorId}`;

interface OrderCustomer {
  id: number;
  name: string;
}

type OrderCustomerAlias = {
  id: number;
  name: string;
};

function submitOrder(
  _orderId: string,
  _customer: OrderCustomer,
  _priority: boolean,
) {
  throw new Error('test');
}

function submitOrderAlias(
  _orderId: string,
  _customer: OrderCustomerAlias,
  _priority: boolean,
) {
  throw new Error('test');
}

const orderCustomer: OrderCustomer = { id: 1, name: 'Ada' };
const orderCustomerAlias: OrderCustomerAlias = { id: 1, name: 'Ada' };

const accountParams: AccountParams = { accountId: 'acc-1', region: 'eu' };
const accountParamsAlias: AccountParamsAlias = {
  accountId: 'acc-1',
  region: 'eu',
};

function processRequest(
  endpoint: string,
  payload: { userId: number; data: string },
  headers: Record<string, string>,
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

  it('default() narrowing survives a following fluent method', async () => {
    const failingFetch = async (_params: { id: number }): Promise<User> => {
      throw new Error('boom');
    };

    // `default()` narrows `.value()` on the object it returns.
    expectTypeOf(
      new Try(failingFetch, { id: 123 }).default(null).value(),
    ).toEqualTypeOf<User | null | Promise<User | null>>();

    // The fluent methods carry `TDefault`, so a method called after
    // `default()` keeps the narrowed `value()` type.
    const rechained = new Try(failingFetch, { id: 123 })
      .default(null)
      .tag('module', 'payment');

    expectTypeOf(rechained.value()).toEqualTypeOf<
      User | null | Promise<User | null>
    >();

    const _narrowed: User | null | Promise<User | null> = rechained.value();

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

  it('accepts breadcrumb keys when the parameter is an interface, the most common way users declare object params', () => {
    new Try(loadAccount, accountParams).breadcrumbs(['accountId']);
  });

  it('accepts breadcrumb keys when the parameter is an object type alias', () => {
    new Try(loadAccountAlias, accountParamsAlias).breadcrumbs(['accountId']);
  });

  it('rejects keys absent from an interface parameter so key typos surface at compile time', () => {
    // @ts-expect-error - accountid is not a key of AccountParams
    new Try(loadAccount, accountParams).breadcrumbs(['accountid']);
  });

  it('rejects key arrays when the first parameter is not an object so arbitrary strings never pass as breadcrumbs', () => {
    // @ts-expect-error - a string parameter exposes no breadcrumb keys
    new Try(trackVisit, 'v-1').breadcrumbs(['visitorId']);
  });

  it('accepts object-syntax key arrays for an interface parameter, the most common way users declare object params', () => {
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs({
      1: ['id', 'name'],
    });
  });

  it('accepts object-syntax key arrays for an object type alias parameter', () => {
    new Try(submitOrderAlias, 'o-1', orderCustomerAlias, true).breadcrumbs({
      1: ['id', 'name'],
    });
  });

  it('rejects object-syntax keys absent from an interface parameter so key typos surface at compile time', () => {
    // @ts-expect-error - nam is not a key of OrderCustomer
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs({
      1: ['id', 'nam'],
    });
  });

  it('rejects object-syntax key arrays for a non-object parameter so arbitrary strings never pass as breadcrumbs', () => {
    // @ts-expect-error - a string parameter exposes no breadcrumb keys
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs({
      0: ['orderId'],
    });
  });

  it('accepts explicit-extractor keys for an interface parameter, the most common way users declare object params', () => {
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs([
      { param: 1, keys: ['id', 'name'] },
    ]);
  });

  it('accepts explicit-extractor keys for an object type alias parameter', () => {
    new Try(submitOrderAlias, 'o-1', orderCustomerAlias, true).breadcrumbs([
      { param: 1, keys: ['id', 'name'] },
    ]);
  });

  it('rejects explicit-extractor keys absent from an interface parameter so key typos surface at compile time', () => {
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs([
      // @ts-expect-error - nam is not a key of OrderCustomer
      { param: 1, keys: ['id', 'nam'] },
    ]);
  });

  it('rejects explicit-extractor keys for a non-object parameter so arbitrary strings never pass as breadcrumbs', () => {
    new Try(submitOrder, 'o-1', orderCustomer, true).breadcrumbs([
      // @ts-expect-error - a string parameter exposes no breadcrumb keys
      { param: 0, keys: ['orderId'] },
    ]);
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

describe('Nextjs Try subclass generics', () => {
  it('default() preserves nextjs subclass type with third generic', async () => {
    const t = new Try(async (): Promise<number> => 42);
    const withDefault = t.default('fallback' as const);
    // Narrowed return via TDefault
    const v = await withDefault.value();
    expectTypeOf(v).toEqualTypeOf<number | 'fallback'>();
  });
});
