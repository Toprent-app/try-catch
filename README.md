# @power-rent/try-catch

A TypeScript utility for simplified async error handling with Sentry integration.
This library enforces you to actually handle errors.

## Think and write in plain English

This library lets you write what you mean, almost like English:

- **Try to run a function with arguments.**
- **If it fails, choose the behavior:**
  - **return a default** with `.default(...).value()`
  - **report to Sentry** with `.report('message')`
  - **get the error as a value** with `.error()`
  - **or let it throw** with `.unwrap()`

New to the library? Read the next three sections in order — they're a
newcomer-first tour. The [API reference](#api) lives at the bottom once the
shape is familiar.

Examples that read like a sentence:

```ts doctest
import { Try } from '@power-rent/try-catch';

// Try to parse JSON; if it fails, fall back to a default
const value = await new Try(JSON.parse, '{"ok":true}')
  .default({ ok: false })
  .value();

if ((value as { ok: boolean }).ok !== true) {
  throw new Error(`expected ok:true, got ${JSON.stringify(value)}`);
}
```

```ts doctest
import { Try } from '@power-rent/try-catch';

// Try to parse JSON; if it fails, give me the error instead of throwing
const error = new Try(JSON.parse, 'not-json').error();
if (!(error instanceof Error)) {
  throw new Error('expected an Error from .error() on bad JSON');
}
```

## Installation

```bash
npm install @power-rent/try-catch
```

Pick the entry point that matches your runtime. Each environment-specific
entry auto-registers the right Sentry reporter as a side effect on import:

```typescript
// Node.js
import { Try } from '@power-rent/try-catch/node';
// Browser / bundler
import { Try } from '@power-rent/try-catch/browser';
// Next.js
import { Try } from '@power-rent/try-catch/nextjs';
// No Sentry — NoopReporter is active; supply your own reporter if you want one
import { Try } from '@power-rent/try-catch';
```

## Sync vs Async

`Try` instances are never thenable. Whether the wrapped function is sync or async, you must call a terminal method (`.value()`, `.unwrap()`, `.error()`, or `.result()`) to run it and read the outcome.

**Async functions** — `await` the terminal method:

```ts doctest
import { Try } from '@power-rent/try-catch';

async function asyncFn(arg: number) {
  return arg * 2;
}

const result = await new Try(asyncFn, 21).value();

if (result !== 42) {
  throw new Error(`expected 42, got ${String(result)}`);
}
```

**Sync functions (and sync fns returning a Promise)** — call a terminal method:

```ts doctest
import { Try } from '@power-rent/try-catch';

const rawString = '{"ok":true}';

// Sync function: call terminal method without await
const result = new Try(JSON.parse, rawString).value();

// Sync fn that returns a Promise: terminal methods still handle it.
function returnsPromise(): Promise<number> {
  return Promise.resolve(42);
}
const n = await new Try(returnsPromise).value();

// Awaiting a Try instance directly yields the Try instance, NOT the result.
// The instance is not thenable, so `await` cannot trigger execution.
// Use .value() / .unwrap() / .error() / .result() instead.
if ((result as { ok: boolean }).ok !== true || n !== 42) {
  throw new Error('sync .value() path failed');
}
```

If you are unsure whether a function is async, using `.value()` without `await` is always safe for sync functions, and using `await .value()` is always safe for async functions.

## When your function throws something that isn't an `Error`

Plenty of code throws strings, numbers, or bare objects. The library normalizes
anything that isn't an `Error` into one and preserves the original value on
`.cause`, so you never have to guess what `catch (e: unknown)` gave you.

- Error-like values — anything carrying a string `name` or `message`, such as a
  cross-realm `Error` or a `{ name, message, stack, code }` object — are rebuilt
  into a real `Error` that keeps their `name`, `message`, `stack`, and own
  enumerable custom fields.
- Every other value becomes an `Error` whose `message` is `String(thrown)`:
  `throw 'boom'` gives `'boom'`, `throw 42` gives `'42'`, `throw { code: 500 }`
  gives `'[object Object]'`. Values that resist stringification — a throwing
  `toString`, a null-prototype object — give
  `'Unknown non-Error thrown value'`.

```ts doctest
import { Try } from '@power-rent/try-catch';

function misbehaves(): number {
  throw 'boom';
}

const error = new Try(misbehaves).error();
if (!(error instanceof Error)) {
  throw new Error('expected an Error');
}
if (error.message !== 'boom') {
  throw new Error(`unexpected message: ${error.message}`);
}
if (error.cause !== 'boom') {
  throw new Error(`cause not preserved, got ${String(error.cause)}`);
}
```

## Usage

The `Try` class provides a fluent interface for handling operations with automatic error reporting to Sentry. Configuration methods mutate the instance and return it for chaining — `.default()` is the exception and returns a fresh instance. Terminal methods (`.value()`, `.unwrap()`, `.error()`, `.result()`) execute the wrapped function.

### Basic Usage

```typescript
// With Sentry for Next.js
import { Try } from '@power-rent/try-catch/nextjs';
// With Sentry for Node
import { Try } from '@power-rent/try-catch/node';
// With Sentry for Browser
import { Try } from '@power-rent/try-catch/browser';
// For custom error reporting service
import { Try } from '@power-rent/try-catch';

// Execute, get result or undefined, and report errors (never throws)
const result = await new Try(asyncFunction, arg1, arg2)
  .report('Failed to execute asyncFunction')
  .value();

// Execute, get result or default value (never throws)
const resultWithDefault = await new Try(asyncFunction, arg1, arg2)
  .default('fallback')
  .value();

// Execute and get error (returns Error or undefined, never throws)
const error = await new Try(asyncFunction, arg1, arg2).error();

// Report to Sentry and let the error bubble up
try {
  const unwrapped = await new Try(asyncFunction, arg1, arg2)
    .report('Failed to execute business logic')
    .unwrap();
} catch (error) {
  // Handle the error
  // error.message will be 'Failed to execute business logic'
  // error.cause will be the original error
}
```

### Advanced Usage

```ts doctest
import { Try, type Reporter, type ErrorReportConfig } from '@power-rent/try-catch';

async function processOrder(
  id: string,
  order: { customerId: number; amount: number },
  flags: { isUrgent: boolean; retryCount: number },
): Promise<string> {
  throw new Error(`cannot process ${id}`);
}

// Chain multiple configuration methods with flexible breadcrumbs.
// The object syntax maps a parameter index to a key list or a transformer.
let recorded: Record<string, unknown> | undefined;
const recordingReporter: Reporter = {
  report(_error: Error, _config: ErrorReportConfig): void {},
  addBreadcrumbs(data: Record<string, unknown>): void {
    recorded = data;
  },
  createWrappedError(error: Error, message: string): Error {
    return new Error(message, { cause: error });
  },
};

const previous = Try.getDefaultReporter();
Try.setDefaultReporter(recordingReporter);
try {
  const result = await new Try(
    processOrder,
    'order-123',
    { customerId: 456, amount: 99.5 },
    { isUrgent: true, retryCount: 3 },
  )
    .breadcrumbs({
      0: (id) => ({ orderId: id }), // { orderId: 'order-123' }
      1: (order) => ({ customerId: order.customerId, priceCategory: order.amount > 100 ? 'high' : 'low' }),
      2: ['isUrgent', 'retryCount'], // { isUrgent: true, retryCount: 3 }
    })
    .report('Failed to process order')
    .tag('operation', 'order-processing')
    .tag('priority', 'high')
    .default(null)
    .value();

  if (result !== null) throw new Error('expected the default');
  const expected = { orderId: 'order-123', customerId: 456, priceCategory: 'low', isUrgent: true, retryCount: 3 };
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
    throw new Error(`unexpected breadcrumbs: ${JSON.stringify(recorded)}`);
  }
} finally {
  Try.setDefaultReporter(previous);
}
```

```typescript
// Check for errors without throwing
const error = await new Try(riskyOperation, data)
  .report('Risky operation failed')
  .error();

if (error) {
  console.log('Operation failed:', error.message);
}

// Enable debug logging (opt-in)
const debugResult = await new Try(problematicFunction, params)
  .debug()
  .report('Function failed')
  .tag('environment', 'development')
  .value();

// Conditional debug logging
const conditional = await new Try(apiCall, endpoint)
  .debug(process.env.NODE_ENV !== 'production')
  .report('API call failed')
  .value();
```

## API

### Constructor

```typescript
new Try<TReturn, TArgs>(
  fn: (...args: TArgs) => TReturn,
  ...args: TArgs
): PublicTry<TReturn, TArgs>
```

- `fn`: The function to execute (can be sync or async)
- `args`: Arguments to pass to the function (any types: strings, numbers, objects, etc.)

`TReturn` binds to the raw return type of `fn`, so an `async` function binds
`TReturn = Promise<T>` and a sync function binds `TReturn = T`. Every terminal
method derives its return type from `TReturn` — see
[Terminal return types](#terminal-return-types).

### Configuration Methods

Configuration methods store settings and return `PublicTry<TReturn, TArgs, TDefault>`, so they chain in any order. All except `.default()` return the same instance they were called on:

#### `.report(message: string): PublicTry<TReturn, TArgs>`

Report to the configured reporter (Sentry in environment-specific entry
points) with a custom error message; the original error is attached as
`.cause`.

#### `.breadcrumbs(config): PublicTry<TReturn, TArgs>`

Record breadcrumbs with flexible extraction from any function parameters. The function name is automatically included in all breadcrumbs for better traceability.

**Breadcrumbs are recorded on every terminal method** — `.value()`,
`.unwrap()`, `.error()`, and `.result()`. The library calls
`addBreadcrumbsIfConfigured()` on the error path of each terminal, so you
can use whichever terminal fits your control flow and still get context on
failure.

```ts doctest
import { Try, type Reporter, type ErrorReportConfig } from '@power-rent/try-catch';

// Capture a breadcrumb even when the caller picks .error() as the terminal.
let breadcrumbCalls = 0;
const recordingReporter: Reporter = {
  report(_error: Error, _config: ErrorReportConfig): void {},
  addBreadcrumbs(_data: Record<string, unknown>, _functionName?: string): void {
    breadcrumbCalls += 1;
  },
  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(message);
    wrapped.cause = error;
    return wrapped;
  },
};

const previous = Try.getDefaultReporter();
Try.setDefaultReporter(recordingReporter);
try {
  const error = new Try(JSON.parse, 'not-json')
    .breadcrumbs((raw: string) => ({ length: raw.length }))
    .error();
  if (!(error instanceof Error)) {
    throw new Error('expected parse error');
  }
  if (breadcrumbCalls !== 1) {
    throw new Error(`breadcrumbs should fire on .error(), got ${breadcrumbCalls}`);
  }
} finally {
  Try.setDefaultReporter(previous);
}
```

**Supports multiple syntax styles:**

```typescript
// Variadic transformer functions — transform each parameter
.breadcrumbs(
  (id: string) => ({ orderId: id }),
  (amount: number) => ({ amountCategory: amount > 100 ? 'large' : 'small' }),
  (meta: object) => ({ metaKeys: Object.keys(meta).length })
)

// Array syntax — positional entries
.breadcrumbs([
  'value',        // { value: arg0 }
  ['customerId'], // extract keys from arg1 object
  'urgent'        // { urgent: arg2 }
])

// Object syntax — parameter index as keys
.breadcrumbs({
  0: (url) => ({ endpoint: url }),
  1: ['userId'],
  2: (headers) => ({ headerCount: Object.keys(headers).length })
})
```

#### `.tag(name: string, value: string): PublicTry<TReturn, TArgs>`

Add a tag for error reporting. Can be called multiple times to add multiple tags.

#### `.tags({ name1: 'value1', name2: 'value2' }): PublicTry<TReturn, TArgs>`

Add multiple tags at once. Merges with tags previously added via `.tag()`.

#### `.debug(enabled?: boolean): PublicTry<TReturn, TArgs>`

Enable debug logging to console. When enabled, errors will be logged to
`console.error`.

#### `.finally(callback: () => void | Promise<void>): PublicTry<TReturn, TArgs>`

Register a callback that runs once after the wrapped function settles,
whether it succeeded or failed — the analogue of
`Promise.prototype.finally`. It runs before `.unwrap()` re-throws. Async
callbacks are awaited. Errors thrown inside the callback are swallowed, and
logged to `console.error` when `.debug()` is enabled.

This method appears on the public type surface only when `TReturn` is fully
Promise-like (`[TReturn] extends [PromiseLike<unknown>]`). Calling it on a `Try`
over a sync function, or over one typed `T | Promise<T>`, is a type error.

### Terminal (Execution) Methods

#### `.unwrap(): MaybePromise<TReturn, Awaited<TReturn>>`

Execute the function and return the result. Throws the original error if
one occurred (or a wrapped error with your custom message if `.report()`
was called). Breadcrumbs configured via `.breadcrumbs()` are recorded on
the error path.

#### `.default<D>(defaultValue: D): PublicTry<TReturn, TArgs, D>`

Substitute `defaultValue` for `.value()` when an error occurs, and narrow
`.value()` to drop `undefined`. The default's type rides on the third type
parameter, so configuration chained after `.default()` keeps the narrowed
`.value()`. It returns a fresh instance that shares the parent's execution —
the original reference keeps its own `.value()` type, and later `.report()` /
`.tag()` calls apply only to the returned chain.

#### `.value(): MaybePromise<TReturn, Awaited<TReturn> | D>`

Execute the function and return the result, the configured default value,
or `undefined` (when no default is set) if an error occurs. Breadcrumbs
are recorded on the error path.

#### `.error(): MaybePromise<TReturn, Error | undefined>`

Execute the function and return the error if one occurred, or `undefined`
if successful. If `.report()` was configured, the error is reported before
being returned. Breadcrumbs are recorded when an error is present.

#### `.result(): MaybePromise<TReturn, TryResult<TReturn>>`

Execute and return a discriminated union:
`{ success: true; value }` or `{ success: false; error }`. Never throws.
If `.report()` was configured, the error is reported before the result is
returned. Breadcrumbs are recorded on the error branch.

At runtime the execution path follows what `fn(...args)` returns, not how `fn`
was declared: a non-thenable result comes back synchronously, and a thenable one
comes back as a Promise. A plain function that returns a `Promise` therefore
takes the async path. `Try` instances are never thenable — `await new Try(fn)`
yields the `Try` instance itself regardless of whether the wrapped function is
sync or async. Use `.value()` / `.unwrap()` / `.error()` / `.result()` to
execute.

### Static Methods

#### `Try.setDefaultReporter(reporter: Reporter): void`

Install the reporter every `Try` instance reports through. The runtime entry
points (`/node`, `/browser`, `/nextjs`) call this on import with the matching
Sentry reporter; the bare entry point leaves a `NoopReporter` in place. The
reporter is global to every `Try` instance.

#### `Try.getDefaultReporter(): Reporter`

Return the currently installed reporter — useful for saving and restoring it
around a scope that swaps in its own.

#### `Try.throwThroughErrorTypes(ignoreErrorTypes: string[]): void`

Register error type names, matched against `error.name`, that `.unwrap()`
throws as-is. A registered error keeps its own message and identity even when
`.report('custom message')` is in the chain, and is not reported; configured
breadcrumbs are still emitted. The registry is global to every `Try` instance.

### Terminal return types

Each terminal returns `MaybePromise<TReturn, TValue>`, where `TReturn` is the
raw return type of the wrapped function:

```typescript
type MayReturnPromise<TReturn> =
  Extract<TReturn, PromiseLike<unknown>> extends never ? false : true;

type MaybePromise<TReturn, TValue> =
  MayReturnPromise<TReturn> extends true ? TValue | Promise<TValue> : TValue;
```

A sync function yields a plain value from every terminal — no `Promise` member
appears in the type:

```typescript
const message = new Try(formatMessage, 1, 'Test', true).value(); // string | undefined
const text = new Try(formatMessage, 1, 'Test', true).unwrap(); // string
const failure = new Try(formatMessage, 1, 'Test', true).error(); // Error | undefined
```

A function whose return type contains a Promise member yields
`TValue | Promise<TValue>`, because such a function can throw synchronously
before it ever creates a Promise. `await` accepts both shapes:

```typescript
const user = await new Try(fetchUser, { id: 123 }).value(); // User | undefined
const error = await new Try(fetchUser, { id: 123 }).error(); // Error | undefined
```

Callers that need an actual `Promise` — to chain `.then()`, or to satisfy a
`Promise<T>` annotation — normalize explicitly:

```typescript
Promise.resolve(new Try(fetchUser, { id: 123 }).value()).then(handleUser);
```

## Examples

### Different Parameter Types

```typescript
// String parameters
function greet(name: string, greeting: string = 'Hello'): string {
  return `${greeting}, ${name}!`;
}
const greeting = new Try(greet, 'Alice', 'Hi').value();

// Number parameters
function add(a: number, b: number): number {
  return a + b;
}
const sum = new Try(add, 5, 3).value();

// Mixed parameter types
function formatMessage(id: number, message: string, urgent: boolean): string {
  const prefix = urgent ? '[URGENT]' : '[INFO]';
  return `${prefix} #${id}: ${message}`;
}
const formatted = new Try(formatMessage, 123, 'System error', true)
  .report('Message formatting failed')
  .tag('component', 'notification')
  .default('Unexpected error')
  .value();

// No parameters
function getCurrentTime(): number {
  return Date.now();
}
const timestamp = new Try(getCurrentTime).value();

// Object parameters (key extraction available)
const user = await new Try(fetchUser, { userId: 123, includeProfile: true })
  .breadcrumbs(['userId']) // ✅ Extract keys from object parameter
  .report('Failed to fetch user')
  .value();

// Custom transformers on any parameter type
const result = await new Try(processString, 'hello world')
  .breadcrumbs((str: string) => ({
    length: str.length,
    firstWord: str.split(' ')[0],
  }))
  .report('String processing failed')
  .tag('operation', 'process')
  .value();

// Mixed parameter types with transformers
const result = await new Try(processOrder, 'order-123', 99.50, true)
  .breadcrumbs(
    (id: string) => ({ orderId: id }),
    (amount: number) => ({ priceCategory: amount > 100 ? 'high' : 'low' }),
    (urgent: boolean) => ({ priority: urgent ? 'high' : 'normal' })
  )
  .report('Order processing failed')
  .value();
```

### Error Handling Patterns

```typescript
// Pattern 1: Use default values
// fetchUser returns a Promise, which is what makes .finally() available here.
const user = await new Try(fetchUser, { userId, includeProfile: true })
  .report('Failed to fetch user')
  .breadcrumbs(['userId'])
  .finally(() => {
    console.log('Completed fetching user');
  })
  .default(null)
  .value();

// Pattern 2: Check errors explicitly
const error = await new Try(updateDatabase, data)
  .tag('table', 'users')
  .report('Database update failed')
  .error();

if (error) {
  // Handle error case
  return { success: false, error: error.message };
}

// Pattern 3: Let errors bubble up
try {
  const result = await new Try(criticalOperation, params)
    .report('Critical operation failed')
    .tag('critical', 'true')
    .unwrap();
} catch (error) {
  // Handle critical failure
}
```

### Method Chaining

```typescript
// All configuration methods can be chained in any order
const result = await new Try(complexOperation, data)
  .tag('module', 'payment')
  .tag('version', '2.0')
  .breadcrumbs(['transactionId', 'amount'])
  .report('Payment processing failed')
  .default({ success: false })
  .value();
```

## Features

- 🚀 **Sync and async in one API** - Terminals return a plain value for sync functions and `T | Promise<T>` when the return type may be a Promise; `await` covers both
- 🔍 **Opt-in Sentry integration** - Errors are reported when `.report('message')` is in the chain
- 🧱 **Non-Error normalization** — strings, numbers, objects thrown by callers become real `Error` instances with `.cause`
- 🍞 **Consistent breadcrumbs** — recorded on every terminal method
- 🏷️ **Tag support** - Add custom tags to Sentry reports
- 🎯 **TypeScript support** - Full type safety
- 🔄 **Flexible error handling** - Choose to ignore, use defaults, inspect errors, or let them bubble up

## Requirements

- Node.js >= 20
- TypeScript >= 5.0 (if using TypeScript; `const` type parameters are used)
- Sentry or an alternative error reporting service (optional — falls back to a no-op reporter if not configured)

## License

ISC
