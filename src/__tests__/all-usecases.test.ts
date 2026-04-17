import { describe, it, expect, expectTypeOf } from 'vitest';
import { Try, NoopReporter } from '../core';

// --- Test fixtures -----------------------------------------------------

const syncNoArgs = (): number => 42;
const syncPrimitives = (a: number, b: string): string => `${b}:${a}`;
const syncObject = (p: { id: number; name: string }): { id: number } => ({
  id: p.id,
});
const syncMixed = (id: number, label: string, flag: boolean): string =>
  `${id}-${label}-${String(flag)}`;
const syncRest = (first: string, ...rest: number[]): number =>
  rest.length + first.length;
const syncOptional = (a: number, b?: string): string => `${a}-${b ?? ''}`;
const genericIdentity = <T>(x: T): T => x;

const asyncNoArgs = async (): Promise<number> => 42;
const asyncPrimitives = async (a: number, b: string): Promise<string> =>
  `${b}:${a}`;
const asyncObject = async (p: {
  id: number;
  name: string;
}): Promise<{ id: number }> => ({ id: p.id });
const asyncMixed = async (
  id: number,
  label: string,
  flag: boolean,
): Promise<string> => `${id}-${label}-${String(flag)}`;

const throwingSync = (): number => {
  throw new Error('boom');
};
const throwingAsync = async (): Promise<number> => {
  throw new Error('boom');
};

// --- Construction ------------------------------------------------------

describe('Construction', () => {
  it('sync: no args | primitives | object | mixed', () => {
    new Try(syncNoArgs);
    new Try(syncPrimitives, 1, 'x');
    new Try(syncObject, { id: 1, name: 'n' });
    new Try(syncMixed, 1, 'x', true);
  });

  it('async: no args | primitives | object | mixed', () => {
    new Try(asyncNoArgs);
    new Try(asyncPrimitives, 1, 'x');
    new Try(asyncObject, { id: 1, name: 'n' });
    new Try(asyncMixed, 1, 'x', true);
  });

  it('generic fn', () => {
    const t = new Try(genericIdentity<number>, 42);
    expectTypeOf(t.value()).toEqualTypeOf<number | undefined>();
  });

  it('optional params', () => {
    new Try(syncOptional, 1);
    new Try(syncOptional, 1, 'x');
  });

  it('rest params', () => {
    new Try(syncRest, 'a', 1, 2, 3);
  });

  it('rejects wrong arg type / wrong arity', () => {
    // @ts-expect-error wrong arg type
    new Try(syncPrimitives, 'a', 'b');
    // @ts-expect-error wrong arity
    new Try(syncPrimitives, 1);
  });
});

// --- Result methods: .value() / .error() / .unwrap() --------------------

describe('Result methods', () => {
  it('sync value/error/unwrap types', () => {
    const t = new Try(syncNoArgs);
    expectTypeOf(t.value()).toEqualTypeOf<number | undefined>();
    expectTypeOf(t.error()).toEqualTypeOf<Error | undefined>();
    expectTypeOf(t.unwrap()).toEqualTypeOf<number>();
  });

  it('async value/error/unwrap types', () => {
    const t = new Try(asyncNoArgs);
    expectTypeOf(t.value()).toEqualTypeOf<Promise<number | undefined>>();
    expectTypeOf(t.error()).toEqualTypeOf<Promise<Error | undefined>>();
    expectTypeOf(t.unwrap()).toEqualTypeOf<Promise<number>>();
  });

  it('sync value returns T', () => {
    expect(new Try(syncNoArgs).value()).toBe(42);
  });

  it('sync error returns Error when thrown', () => {
    const e = new Try(throwingSync).error();
    expect(e).toBeInstanceOf(Error);
  });

  it('async value returns T', async () => {
    await expect(new Try(asyncNoArgs).value()).resolves.toBe(42);
  });

  it('sync unwrap throws', () => {
    expect(() => new Try(throwingSync).unwrap()).toThrow('boom');
  });

  it('async unwrap rejects', async () => {
    await expect(new Try(throwingAsync).unwrap()).rejects.toThrow('boom');
  });
});

// --- PromiseLike / await behavior --------------------------------------

describe('PromiseLike / await', () => {
  it('await async Try resolves to T | undefined', async () => {
    const result = await new Try(asyncNoArgs);
    expectTypeOf(result).toEqualTypeOf<number | undefined>();
    expect(result).toBe(42);
  });

  it('await async Try.default resolves to T | D', async () => {
    const result = await new Try(asyncNoArgs).default('fallback' as const);
    expectTypeOf(result).toEqualTypeOf<number | 'fallback'>();
  });

  it('async .then typechecks', async () => {
    const result = await new Try(asyncNoArgs).then((v) => {
      expectTypeOf(v).toEqualTypeOf<number | undefined>();
      return v ?? 0;
    });
    expect(result).toBe(42);
  });

  it('sync .then type is never', () => {
    const t = new Try(syncNoArgs);
    expectTypeOf(t.then).toEqualTypeOf<never>();
  });

  it('sync Try has no runtime then (await returns instance as-is)', async () => {
    const t = new Try(syncNoArgs);
    expect((t as unknown as { then?: unknown }).then).toBeUndefined();
    const awaited = await (t as unknown as Promise<unknown>);
    expect(awaited).toBe(t);
  });

  it('sync usage inside sync function body', () => {
    function f(): string {
      return new Try(syncPrimitives, 1, 'x').unwrap();
    }
    expect(f()).toBe('x:1');
  });
});

// --- .default() --------------------------------------------------------

describe('.default()', () => {
  it('default(null) narrows value to T | null (sync)', () => {
    const v = new Try(syncNoArgs).default(null).value();
    expectTypeOf(v).toEqualTypeOf<number | null>();
  });

  it('default([]) narrows value to T | never[] (async)', () => {
    const v = new Try(asyncNoArgs).default([]).value();
    expectTypeOf(v).toEqualTypeOf<Promise<number | never[]>>();
  });

  it('default(d).unwrap() still T', () => {
    const v = new Try(syncNoArgs).default('fb').unwrap();
    expectTypeOf(v).toEqualTypeOf<number>();
  });

  it('chained .report().default("fb").value() → T | "fb"', () => {
    const v = new Try(syncNoArgs)
      .report('msg')
      .default('fb' as const)
      .value();
    expectTypeOf(v).toEqualTypeOf<number | 'fb'>();
  });

  it('default returns fresh instance; prior reference keeps prior type', () => {
    const base = new Try(syncNoArgs);
    base.default('fb');
    expectTypeOf(base.value()).toEqualTypeOf<number | undefined>();
  });

  it('runtime: default value returned on sync error', () => {
    const v = new Try(throwingSync).default(99).value();
    expect(v).toBe(99);
  });

  it('runtime: default value returned on async error', async () => {
    const v = await new Try(throwingAsync).default(99).value();
    expect(v).toBe(99);
  });
});

// --- .breadcrumbs() overloads ------------------------------------------

describe('.breadcrumbs()', () => {
  it('string key array validated against arg[0]', () => {
    new Try(syncObject, { id: 1, name: 'n' }).breadcrumbs(['id', 'name']);
    // @ts-expect-error invalid key
    new Try(syncObject, { id: 1, name: 'n' }).breadcrumbs(['bad']);
  });

  it('variadic transformers: typed params', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs(
      (id) => {
        expectTypeOf(id).toEqualTypeOf<number>();
        return { id };
      },
      (label) => {
        expectTypeOf(label).toEqualTypeOf<string>();
        return { label };
      },
      (flag) => {
        expectTypeOf(flag).toEqualTypeOf<boolean>();
        return { flag };
      },
    );
  });

  it('variadic transformers reject wrong input', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs(
      // @ts-expect-error id is number not string
      (id: string) => ({ id }),
    );
  });

  it('positional array with string labels (mixed with extractor)', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs([
      'idLabel',
      { param: 1, as: 'value' },
    ]);
  });

  it('positional array with readonly string[] keys', () => {
    new Try(syncObject, { id: 1, name: 'n' }).breadcrumbs([
      ['id', 'name'] as const,
    ]);
  });

  it('extractor { param, keys }', () => {
    new Try(syncObject, { id: 1, name: 'n' }).breadcrumbs([
      { param: 0, keys: ['id'] },
    ]);
  });

  it('extractor { param, transform }', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs([
      { param: 0, transform: (id: number) => ({ id }) },
    ]);
  });

  it('extractor { param, as }', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs([
      { param: 0, as: 'length' },
      { param: 1, as: 'type' },
      { param: 2, as: 'value' },
      { param: 0, as: 'toString' },
    ]);
  });

  it('object syntax { 0: [...], 1: fn, 2: extractor }', () => {
    new Try(syncMixed, 1, 'x', true).breadcrumbs({
      0: (id) => {
        expectTypeOf(id).toEqualTypeOf<number>();
        return { id };
      },
      1: (label) => ({ label }),
      2: (flag) => ({ flag }),
    });
  });

  it('rejects invalid key in { param, keys }', () => {
    new Try(syncObject, { id: 1, name: 'n' }).breadcrumbs([
      // @ts-expect-error invalid key
      { param: 0, keys: ['bad'] },
    ]);
  });
});

// --- .report / .tag / .tags / .finally / .debug -----------------------

describe('chain methods', () => {
  it('chain order independence', () => {
    new Try(syncNoArgs)
      .report('m')
      .tag('a', 'b')
      .tags({ c: 'd' })
      .finally(() => undefined)
      .debug(true)
      .value();

    new Try(syncNoArgs)
      .debug()
      .finally(() => undefined)
      .tags({ c: 'd' })
      .tag('a', 'b')
      .report('m')
      .value();
  });

  it('.tags({ a: "1" }) only string→string', () => {
    new Try(syncNoArgs).tags({ a: '1' });
    // @ts-expect-error value must be string
    new Try(syncNoArgs).tags({ a: 1 });
  });

  it('.tag rejects non-string value', () => {
    // @ts-expect-error second arg must be string
    new Try(syncNoArgs).tag('k', 1);
  });

  it('finally callback runs', () => {
    let ran = false;
    new Try(syncNoArgs)
      .finally(() => {
        ran = true;
      })
      .value();
    expect(ran).toBe(true);
  });
});

// --- Statics -----------------------------------------------------------

describe('Statics', () => {
  it('setDefaultReporter typechecks', () => {
    Try.setDefaultReporter(new NoopReporter());
  });

  it('throwThroughErrorTypes typechecks', () => {
    Try.throwThroughErrorTypes(['X']);
  });
});

// --- TryResult narrowing -----------------------------------------------

describe('TryResult narrowing', () => {
  it('narrows success branch to value:T and error branch to Error', () => {
    const r = new Try(syncNoArgs).result();
    if (r.success) {
      expectTypeOf(r.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(r.error).toEqualTypeOf<Error>();
    }
  });

  it('async result narrows', async () => {
    const r = await new Try(asyncNoArgs).result();
    if (r.success) {
      expectTypeOf(r.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(r.error).toEqualTypeOf<Error>();
    }
  });
});
