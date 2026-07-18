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

Examples that read like a sentence:

```ts
// Try to get a user; if it fails, report and return null
const user = await new Try(fetchUser, { id: 123 })
  .report('Failed to fetch user')
  .default(null)
  .value();

// Try to charge a card; if it fails, throw with a custom message (and report)
const receipt = await new Try(chargeCard, { amount: 1000, currency: 'USD' })
  .report('Payment failed')
  .unwrap();

// Try to parse JSON; if it fails, give me the error instead of throwing
const error = await new Try(JSON.parse, raw)
  .error();

// Or try to parse JSON; if it fails, give me the default value instead of throwing
const value = await new Try(JSON.parse, raw)
  .default({ initial: 'value' })
  .value();

// Or try to parse JSON; if it fails, give me value or undefined instead of throwing
const value = await new Try(JSON.parse, raw)
  .value();

// Try with flexible logic, the function will be executed once
const shouldThrow = someCustomLogic();
const attempt = await new Try(chargeCard, { amount: 1000, currency: 'USD' })
const result = attempt.value();
const error = attempt.error();
if (shouldThrow) {
  throw error;
}
return result;
```

## Installation

```bash
npm install @power-rent/try-catch
```

## Usage

The `Try` class provides a fluent interface for handling async operations with automatic error reporting to Sentry. Each method returns a new instance.

### Basic Usage

```typescript
// With Sentry for Next.js
import Try from '@power-rent/try-catch/nextjs';
// With Sentry for Node
import Try from '@power-rent/try-catch/node';
// With Sentry for Browser
import Try from '@power-rent/try-catch/browser';
// For custom error reporting service
import Try from '@power-rent/try-catch';

// Execute, get result or undefined, and report errors (never throws)
const result = await new Try(asyncFunction, arg1, arg2)
  .report('Failed to execute asyncFunction')
  .value();

// Execute, get result or default value (never throws)
const result = await new Try(asyncFunction, arg1, arg2)
  .default('fallback')
  .value();

// Execute and get error (returns Error or undefined, never throws)
const error = await new Try(asyncFunction, arg1, arg2).error();

// Report to Sentry and let the error bubble up
try {
  const result = await new Try(asyncFunction, arg1, arg2)
    .report('Failed to execute business logic')
    .unwrap();
} catch (error) {
  // Handle the error
  // error.message will be 'Failed to execute business logic'
  // error.cause will be the original error
}
```

### Parameter Types

The library accepts any parameter types as function arguments:

```typescript
// String parameters
const greeting = new Try(greet, 'Alice', 'Hi').value();

// Number parameters
const sum = new Try(add, 5, 3).unwrap();

// Mixed parameter types
const message = new Try(formatMessage, 123, 'Test message', true).value();

// No parameters
const timestamp = new Try(getCurrentTime).value();
```

Sync functions return values immediately; async functions require `await`.

### Advanced Usage

```typescript
// Chain multiple configuration methods with flexible breadcrumbs
const result = await new Try(processOrder, 'order-123', { customerId: 456, amount: 99.50 }, { isUrgent: true, retryCount: 3, sensitiveData: {} })
  .breadcrumbs(
    'orderId', // add to breadcrumbs as { orderId: 'order-123' }
    (order) => ({ customerId: order.customerId, priceCategory: order.amount > 100 ? 'high' : 'low' }),
    ['isUrgent', 'retryCount'] // add to breadcrumbs as { isUrgent: true, retryCount: 3 }
  )
  .report('Failed to process order')   // Custom error message
  .tag('operation', 'order-processing') // Add Sentry tag
  .tag('priority', 'high')            // Add another tag
  .default(null)
  .value();

// Custom transformers work with any parameter types
const result = await new Try(calculateDistance, 10, 20, 'meters')
  .breadcrumbs(
    (x: number) => ({ startX: x }),
    (y: number) => ({ startY: y }),
    (unit: string) => ({ measurementUnit: unit })
  )
  .report('Distance calculation failed')
  .tag('operation', 'calculation')
  .default(0)
  .value();

// Check for errors without throwing
const error = await new Try(riskyOperation, data)
  .report('Risky operation failed')
  .error();

if (error) {
  console.log('Operation failed:', error.message);
} else {
  console.log('Operation succeeded');
}

// Enable debug logging (opt-in)
const result = await new Try(problematicFunction, params)
  .debug() // Logs errors to console.error
  .report('Function failed')
  .tag('environment', 'development')
  .value();

// Conditional debug logging
const result = await new Try(apiCall, endpoint)
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

The constructor accepts any number of arguments of any type. Breadcrumbs functionality supports all parameter types through custom transformer functions.

### Configuration Methods

All configuration methods return a new `Try` instance, enabling method chaining:

#### `.report(message: string): Try<T, TArgs>`

Report to Sentry with a custom error message, attach the original error as a cause

#### `.breadcrumbs(config): Try<T, TArgs>`

Record breadcrumbs with flexible extraction from any function parameters. The function name is automatically included in all breadcrumbs for better traceability.

**Supports multiple syntax styles:**

```typescript
// Variadic transformer functions - transform each parameter
.breadcrumbs(
  (id: string) => ({ orderId: id }),
  (amount: number) => ({ amountCategory: amount > 100 ? 'large' : 'small' }),
  (meta: object) => ({ metaKeys: Object.keys(meta).length })
)

// Array syntax - positional entries
.breadcrumbs([
  'value',        // { value: arg0 }
  ['customerId'], // extract keys from arg1 object
  'urgent'        // { urgent: arg2 }
])

// Object syntax - parameter index as keys
.breadcrumbs({
  0: (url) => ({ endpoint: url }),
  1: ['userId'],
  2: (headers) => ({ headerCount: Object.keys(headers).length })
})
```

#### `.tag(name: string, value: string): Try<T, TArgs>`

Add a tag for Sentry error reporting. Can be called multiple times to add multiple tags.
#### `.tags({ name1: 'value1', name2: 'value2' }): Try<T, TArgs>`

Add multiple tags for Sentry error reporting. Each call overrides previous tags.

#### `.debug(enabled?: boolean): Try<T, TArgs>`

Enable debug logging to console. When enabled, errors will be logged to console.error.

### Execution Methods

#### `.unwrap(): T | Promise<Awaited<T>>`

Execute the function and return the result. Throws the original error if one occurred. Will mask the error message if `.report('custom message')` is called in the chain.

#### `.default<Return>(defaultValue: Return): Try<T, TArgs>`

Set a default value that will be returned by `.value()` when an exception occurs.

#### `.value(): T | undefined | Promise<Awaited<T> | undefined>`

Execute the function and return the result, the configured default value, or `undefined` if an error occurs.

#### `.error(): Error | undefined | Promise<Error | undefined>`

Execute the function and return the error if one occurred, or `undefined` if successful.

Sync functions return values immediately; async functions return Promises.

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

// Any parameter types (custom transformers available)
const result = await new Try(processString, 'hello world')
  .breadcrumbs((str: string) => ({
    length: str.length,
    firstWord: str.split(' ')[0]
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

## Report-once aggregation (Node / Next.js)

On the **Node** (`@power-rent/try-catch/node`) and **Next.js Node runtime**
(`@power-rent/try-catch/nextjs`) entries, nested `Try` calls that wrap the same
root failure are aggregated into **exactly one Sentry event**, assembled as a
nested `cause` chain. This solves the "one root error reported N times up the
call stack" problem.

```ts
// level 3 throws → each layer reports → ONE Sentry event:
//   "outer failed" → "mid failed" → "inner failed" → Error('db down')
async function level3() { throw new Error('db down'); }
async function level2() { return new Try(level3).report('inner failed').unwrap(); }
async function level1() { return new Try(level2).report('mid failed').unwrap(); }
await new Try(level1).report('outer failed').value();
```

**How it works.** The outermost `Try` in an `AsyncLocalStorage` context opens a
scope (the *boundary*); nested `Try` calls collect into it instead of emitting;
the boundary emits **one event per distinct root failure** when it settles. The
leaf of the chain is the innermost original error, so a pre-existing application
`cause` chain (e.g. `DomainError(cause: dbError)`) is preserved. The reported
stack is the failed function's stack — `Try`/wrapper frames are not added.

### Behavior changes on the collector path

- **`.error()` and `.result()` now report** when `.report()` was called. They
  still return the error/result to you, but no longer suppress the Sentry
  report. (On the browser / bare-core / Edge legacy path they remain
  non-reporting, exactly as before.)
- **Graceful recovery still reports.** `.report().default().value()` returns the
  default *and* reports — recovery no longer means silence.
- **Breadcrumbs are event-scoped.** On the collector path breadcrumb data is
  attached to the one assembled event via an isolated Sentry scope, instead of
  added to the global Sentry breadcrumb trail.

### Entries & runtimes

| Entry | Runtime | Behavior |
| --- | --- | --- |
| `/node` | Node.js | Collector (report-once) |
| `/nextjs` | Next.js Node runtime | Collector (report-once) |
| `/nextjs` | Next.js Edge / client | Legacy per-terminal report |
| `/browser`, bare `.` | anywhere | Legacy per-terminal report |

The Next.js entry installs the collector synchronously at module evaluation
via `process.getBuiltinModule('node:async_hooks')` (no `node:` import ever
reaches the Edge or client bundles), falling back to a runtime-guarded dynamic
import on Node versions without `getBuiltinModule`.

### Forcing one boundary across siblings: `Try.scope()`

Aggregation normally happens through nesting: the outermost `Try` is the
boundary. Two *sibling* top-level `Try`s are each their own boundary and report
separately. `Try.scope(fn)` runs `fn` inside a single fresh aggregation scope,
so every `Try` created inside it — siblings included — collects into one
boundary that flushes exactly once when `fn` settles:

```typescript
// e.g. one request-level boundary: siblings sharing a root → ONE event
await Try.scope(async () => {
  await new Try(stepOne).report('step one failed').value();
  await new Try(stepTwo).report('step two failed').value();
});
```

`fn`'s result is passed through unchanged; if `fn` throws/rejects, the scope is
flushed first and the error propagates normally (`Try.scope` is a scope
wrapper, not an error handler). A nested `Try.scope` always opens its own fresh
boundary. On the legacy path (browser / Edge / bare core) it simply runs `fn`.

### Custom providers & reporters

- `Try.setScopeProvider(provider)` installs a custom scope provider (advanced;
  Node/Next.js only). The default no-op provider keeps the legacy path.
- A custom `Reporter` may implement the optional `capture(assembledError, { tags, breadcrumbs })`
  method to receive the assembled event; reporters without it fall back to the
  per-root `report()`.

### Limitations

- **Fire-and-forget / detached work.** A nested `Try` that settles *after* its
  boundary has already flushed (e.g. not `await`-ed, or scheduled via a timer)
  emits its own event separately rather than joining the aggregate. It is never
  silently lost.
- **Sync boundaries** aggregate only synchronously-collected nested errors; an
  async nested `Try` under a sync boundary emits separately.
- **Next.js cold start.** The collector is installed synchronously at
  entry-module evaluation (via `process.getBuiltinModule`), so even a `Try`
  running in the same tick as module load aggregates. Only on Node versions
  without `getBuiltinModule` (< 20.16) does the async dynamic-import fallback
  apply, where a `Try` in the load tick itself would briefly use the legacy
  path.
- **Grouping is by identity.** Distinct root failures produce distinct events,
  even two independent failures with the same message. Non-`Error` throws
  (`null`, `undefined`, strings, plain objects) are reported safely and grouped
  by identity.
- **Sentry linked-exception depth.** Very deep chains may be truncated by
  Sentry's rendering; configure `linkedErrorsIntegration({ limit })` if your
  layer depth is large.

## Features

- 🚀 **Promise-like interface** - Can be awaited directly
- 🔍 **Automatic Sentry integration** - Errors are automatically reported
- 🍞 **Flexible breadcrumb support** - Extract context from any parameter types using transformers
- 🏷️ **Tag support** - Add custom tags to Sentry reports
- 🎯 **TypeScript support** - Full type safety
- 🔄 **Flexible error handling** - Choose to ignore, use defaults, inspect errors, or let them bubble up

## Requirements

- Node.js >= 20
- TypeScript >= 4.5 (if using TypeScript)
- Sentry or an alternative error reporting service

## License

ISC
