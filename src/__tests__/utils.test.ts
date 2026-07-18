import { describe, it, expect, vi } from 'vitest';

import {
  PredefinedTransformers,
  BreadcrumbExtractorUtil,
  TransformerRegistry,
} from '../utils';

describe('PredefinedTransformers.length', () => {
  it('returns the length of strings and arrays', () => {
    expect(PredefinedTransformers.length('abc', 0)).toEqual({
      param0_length: 3,
    });
    expect(PredefinedTransformers.length([1, 2], 1)).toEqual({
      param1_length: 2,
    });
  });

  it('returns the key count for objects', () => {
    expect(PredefinedTransformers.length({ a: 1, b: 2 }, 0)).toEqual({
      param0_length: 2,
    });
  });

  it('returns {} for non-collection values', () => {
    expect(PredefinedTransformers.length(42, 0)).toEqual({});
    expect(PredefinedTransformers.length(null, 0)).toEqual({});
  });
});

describe('BreadcrumbExtractorUtil.extract — array (positional) syntax', () => {
  it('maps a string entry to its arg and extracts keys from an array entry', () => {
    const data = BreadcrumbExtractorUtil.extract(
      ['orderId', ['customerId']] as never,
      ['order-1', { customerId: 42, other: 'x' }] as never,
    );

    expect(data).toEqual({ orderId: 'order-1', customerId: 42 });
  });

  it('skips an array entry when the positional arg is not an object', () => {
    const data = BreadcrumbExtractorUtil.extract(
      ['a', ['k']] as never,
      ['val', 'not-object'] as never,
    );

    expect(data).toEqual({ a: 'val' });
  });
});

describe('BreadcrumbExtractorUtil.extract — object syntax fallthrough', () => {
  it('returns nothing for a config value that is neither keys nor transformer', () => {
    const data = BreadcrumbExtractorUtil.extract(
      { 0: 'invalid' } as never,
      ['arg0'] as never,
    );

    expect(data).toEqual({});
  });

  it('skips an out-of-range parameter index', () => {
    const data = BreadcrumbExtractorUtil.extract(
      { 5: ['k'] } as never,
      ['only'] as never,
    );

    expect(data).toEqual({});
  });

  it('skips an array-keys config when the arg is not an object', () => {
    const data = BreadcrumbExtractorUtil.extract(
      { 0: ['k'] } as never,
      ['str'] as never,
    );

    expect(data).toEqual({});
  });
});

describe('BreadcrumbExtractorUtil.extract — unsupported positional entry', () => {
  it('ignores entries that are neither strings nor arrays', () => {
    const data = BreadcrumbExtractorUtil.extract(
      [42] as never,
      ['arg0'] as never,
    );

    expect(data).toEqual({});
  });
});

describe('BreadcrumbExtractorUtil.extract — other dispatch edges', () => {
  it('skips string-keys config when the first arg is not an object', () => {
    expect(
      BreadcrumbExtractorUtil.extract(['a'] as never, ['not-object'] as never),
    ).toEqual({});
  });

  it('skips transformers beyond the args length', () => {
    const transform = (value: unknown) => ({ got: value });
    expect(
      BreadcrumbExtractorUtil.extract(
        [transform, transform] as never,
        ['only'] as never,
      ),
    ).toEqual({ got: 'only' });
  });

  it('returns {} for a config that is neither array nor object', () => {
    expect(
      BreadcrumbExtractorUtil.extract('nope' as never, [] as never),
    ).toEqual({});
  });
});

describe('BreadcrumbExtractorUtil.extractFromParameter', () => {
  it("applies a predefined transformer via the 'as' form", () => {
    const data = BreadcrumbExtractorUtil.extractFromParameter(
      { param: 0, as: 'length' } as never,
      [[1, 2, 3]] as never,
    );

    expect(data).toEqual({ param0_length: 3 });
  });

  it('returns {} for an out-of-range param', () => {
    const data = BreadcrumbExtractorUtil.extractFromParameter(
      { param: 5, keys: ['a'] } as never,
      [{ a: 1 }] as never,
    );

    expect(data).toEqual({});
  });

  it('returns {} for an extractor with no keys/transform/as', () => {
    const data = BreadcrumbExtractorUtil.extractFromParameter(
      { param: 0 } as never,
      ['x'] as never,
    );

    expect(data).toEqual({});
  });
});

describe('TransformerRegistry.applyPredefined error handling', () => {
  it('logs and returns {} when a predefined transformer throws under debug', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // An object whose toString throws → exercises the catch + debug log.
    const throwing = {
      toString() {
        throw new Error('boom');
      },
    };
    const out = TransformerRegistry.applyPredefined(
      'toString',
      throwing,
      0,
      true,
    );

    expect(out).toEqual({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns {} silently when a predefined transformer throws without debug', () => {
    const throwing = {
      toString() {
        throw new Error('boom');
      },
    };

    expect(
      TransformerRegistry.applyPredefined('toString', throwing, 0, false),
    ).toEqual({});
  });
});
