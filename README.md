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

Plenty of code throws strings, numbers, or bare objects. The library
normalizes anything that isn't an `Error` into one: the wrapped error carries
`message === 'Non-Error thrown (<type>)'` and preserves the original value on
`.cause`. You never have to guess what `catch (e: unknown)` gave you.

```ts doctest
import { Try } from '@power-rent/try-catch';

function misbehaves(): number {
  throw 'boom';
}

const error = new Try(misbehaves).error();
if (!(error instanceof Error)) {
  throw new Error('expected an Error');
}
if (error.message !== 'Non-Error thrown (string)') {
  throw new Error(`unexpected message: ${error.message}`);
}
if (error.cause !== 'boom') {
  throw new Error(`cause not preserved, got ${String(error.cause)}`);
}
```

## Usage

The `Try` class provides a fluent interface for handling operations with automatic error reporting to Sentry. Each configuration method returns a new instance; terminal methods (`.value()`, `.unwrap()`, `.error()`, `.result()`) execute the wrapped function.

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
} catch (err) {
  // err.message will be 'Failed to execute business logic'
  // err.cause will be the original error
}
```

### Advanced Usage

```typescript
// Chain multiple configuration methods with flexible breadcrumbs
const result = await new Try(processOrder, 'order-123', { customerId: 456, amount: 99.50 }, { isUrgent: true, retryCount: 3 })
  .breadcrumbs(
    'orderId',                                                     // { orderId: 'order-123' }
    (order) => ({ customerId: order.customerId, priceCategory: order.amount > 100 ? 'high' : 'low' }),
    ['isUrgent', 'retryCount']                                     // { isUrgent: true, retryCount: 3 }
  )
  .report('Failed to process order')
  .tag('operation', 'order-processing')
  .tag('priority', 'high')
  .default(null)
  .value();

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
new Try<T, TArgs>(fn: (...args: TArgs) => T | Promise<T>, ...args: TArgs)
```

- `fn`: The function to execute (can be sync or async)
- `args`: Arguments to pass to the function (any types: strings, numbers, objects, etc.)

### Configuration Methods

All configuration methods return the `Try` instance, enabling method chaining:

#### `.report(message: string): Try<T, TArgs>`

Report to the configured reporter (Sentry in environment-specific entry
points) with a custom error message; the original error is attached as
`.cause`.

#### `.breadcrumbs(config): Try<T, TArgs>`

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

#### `.tag(name: string, value: string): Try<T, TArgs>`

Add a tag for error reporting. Can be called multiple times to add multiple tags.

#### `.tags({ name1: 'value1', name2: 'value2' }): Try<T, TArgs>`

Add multiple tags at once. Merges with tags previously added via `.tag()`.

#### `.debug(enabled?: boolean): Try<T, TArgs>`

Enable debug logging to console. When enabled, errors will be logged to
`console.error`.

### Terminal (Execution) Methods

#### `.unwrap(): T | Promise<Awaited<T>>`

Execute the function and return the result. Throws the original error if
one occurred (or a wrapped error with your custom message if `.report()`
was called). Breadcrumbs configured via `.breadcrumbs()` are recorded on
the error path.

#### `.default<D>(defaultValue: D): Try<T, TArgs, D>`

Return a new `Try` instance that substitutes `defaultValue` for `.value()`
when an error occurs. Returns a fresh instance — the original reference is
unchanged; subsequent `.report()` / `.tag()` calls after `.default()` apply
only to the returned chain.

#### `.value(): T | D | Promise<Awaited<T> | D>`

Execute the function and return the result, the configured default value,
or `undefined` (when no default is set) if an error occurs. Breadcrumbs
are recorded on the error path.

#### `.error(): Error | undefined | Promise<Error | undefined>`

Execute the function and return the error if one occurred, or `undefined`
if successful. Breadcrumbs are recorded when an error is present.

#### `.result(): TryResult<T> | Promise<TryResult<T>>`

Execute and return a discriminated union:
`{ success: true; value }` or `{ success: false; error }`. Never throws.
Breadcrumbs are recorded on the error branch.

Sync functions return values immediately; async functions return Promises.
`Try` instances are never thenable — `await new Try(fn)` yields the `Try`
instance itself regardless of whether the wrapped function is sync or async.
Use `.value()` / `.unwrap()` / `.error()` / `.result()` to execute.

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

// Object parameters (key extraction available)
const user = await new Try(fetchUser, { userId: 123, includeProfile: true })
  .breadcrumbs(['userId'])
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
```

### Error Handling Patterns

```typescript
// Pattern 1: Use default values
const user = await new Try(fetchUser, userId)
  .report('Failed to fetch user')
  .breadcrumbs(['userId'])
  .default(null)
  .finally(() => {
    console.log('Completed fetching user');
  })
  .value();

// Pattern 2: Check errors explicitly
const error = await new Try(updateDatabase, data)
  .tag('table', 'users')
  .report('Database update failed')
  .error();

if (error) {
  return { success: false, error: error.message };
}

// Pattern 3: Let errors bubble up
try {
  const result = await new Try(criticalOperation, params)
    .report('Critical operation failed')
    .tag('critical', 'true')
    .unwrap();
} catch (err) {
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

- 🚀 **Promise-like interface** — async instances can be `await`-ed directly
- 🔍 **Automatic Sentry integration** — errors are reported via environment adapters
- 🧱 **Non-Error normalization** — strings, numbers, objects thrown by callers become real `Error` instances with `.cause`
- 🍞 **Consistent breadcrumbs** — recorded on every terminal method
- 🏷️ **Tag support** — categorize reports with tags
- 🎯 **TypeScript support** — full type safety
- 🔄 **Flexible error handling** — ignore, default, inspect, or re-throw

## Requirements

- Node.js >= 20
- TypeScript >= 4.5 (if using TypeScript)
- Sentry or an alternative error reporting service (optional — `NoopReporter` is the default)

## License

ISC
