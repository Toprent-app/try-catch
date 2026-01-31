import { describe, it, expectTypeOf } from 'vitest';

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

describe('Try README type safety', () => {
  it('preserves value() types for sync/async functions', () => {
    const asyncValue = new Try(fetchUser, { id: 123 }).value();
    const syncValue = new Try(formatMessage, 1, 'Test', true).value();

    expectTypeOf(asyncValue).toEqualTypeOf<Promise<User | undefined>>();
    expectTypeOf(syncValue).toEqualTypeOf<Promise<string | undefined>>();
  });

  it('narrows value() return when default() is provided', () => {
    const withDefault = new Try(fetchUser, { id: 123 }).default(null).value();

    expectTypeOf(withDefault).toEqualTypeOf<Promise<User | null>>();
  });

  it('keeps error() typed as Error | undefined', () => {
    const errorValue = new Try(fetchUser, { id: 123 })
      .report('Failed to fetch user')
      .error();

    expectTypeOf(errorValue).toEqualTypeOf<Promise<Error | undefined>>();
  });

  it('keeps unwrap() typed as Awaited<T>', () => {
    const receipt = new Try(chargeCard, { amount: 1000, currency: 'USD' })
      .report('Payment failed')
      .unwrap();

    expectTypeOf(receipt).toEqualTypeOf<Promise<Receipt>>();
  });

  it('validates breadcrumbs keys against object parameter types', () => {
    new Try(fetchUser, { id: 123 }).breadcrumbs(['id'] as const);

    // @ts-expect-error - breadcrumb keys must exist on parameter object
    new Try(fetchUser, { id: 123 }).breadcrumbs<['missingKey']>(['missingKey']);
  });

  it('rejects invalid argument types', () => {
    // @ts-expect-error - invalid argument types for formatMessage
    new Try(formatMessage, '1', 'Test', true);

    // @ts-expect-error - invalid argument types for chargeCard
    new Try(chargeCard, { amount: '1000', currency: 'USD' });
  });
});
