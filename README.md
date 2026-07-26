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
const attempt = new Try(chargeCard, { amount: 1000, currency: 'USD' });
const result = await attempt.value();
const error = await attempt.error();
if (shouldThrow && error) {
  throw error;
}
return result;
```

## Installation

```bash
npm install @power-rent/try-catch
```

## Usage

The `Try` class provides a fluent interface for handling async operations with opt-in error reporting to Sentry. Configuration methods mutate the instance and return it, so a chain always refers to one `Try`.

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

Sync functions return values immediately; async functions require `await`. See
[Terminal return types](#terminal-return-types) for the exact type of each
terminal method.

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
new Try<TReturn, TArgs>(
  fn: (...args: TArgs) => TReturn,
  ...args: TArgs
): PublicTry<TReturn, TArgs>
```

- `fn`: The function to execute (can be sync or async)
- `args`: Arguments to pass to the function (any types: strings, numbers, objects, etc.)

`TReturn` binds to the raw return type of `fn`, so an `async` function binds
`TReturn = Promise<T>` and a sync function binds `TReturn = T`. Terminal methods
derive their return types from `TReturn` — see
[Terminal return types](#terminal-return-types).

The constructor accepts any number of arguments of any type. Breadcrumbs functionality supports all parameter types through custom transformer functions.

### Configuration Methods

Configuration methods store settings on the instance and return it, typed as
`PublicTry<TReturn, TArgs>`, enabling method chaining:

#### `.report(message: string): PublicTry<TReturn, TArgs>`

Report to Sentry with a custom error message, attach the original error as a cause

#### `.breadcrumbs(config): PublicTry<TReturn, TArgs>`

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

#### `.tag(name: string, value: string): PublicTry<TReturn, TArgs>`

Add a tag for Sentry error reporting. Can be called multiple times to add multiple tags.

#### `.tags({ name1: 'value1', name2: 'value2' }): PublicTry<TReturn, TArgs>`

Add multiple tags for Sentry error reporting. Each call merges its record into
the accumulated tags; a repeated key takes the value from the latest call, so
`.tag('a', '1').tags({ b: '2' })` yields `{ a: '1', b: '2' }` and
`.tag('a', '1').tags({ a: '2' })` yields `{ a: '2' }`.

#### `.debug(enabled?: boolean): PublicTry<TReturn, TArgs>`

Enable debug logging to console. When enabled, errors will be logged to console.error.

#### `.finally(callback: () => void | Promise<void>): PublicTry<TReturn, TArgs>`

Register a callback that runs once after the wrapped function settles, on both
the success and the error path, before `.unwrap()` re-throws.

This method is on the public type surface when `TReturn` is fully Promise-like
(`[TReturn] extends [PromiseLike<unknown>]`). Calling it on a `Try` over a sync
function, or over a function typed `T | Promise<T>`, is a type error.

```typescript
const user = await new Try(fetchUser, { id: 123 })
  .report('Failed to fetch user')
  .finally(() => {
    console.log('Completed fetching user');
  })
  .value();
```

### Execution Methods

#### `.unwrap(): MaybePromise<TReturn, Awaited<TReturn>>`

Execute the function and return the result. Throws the original error if one occurred. Will mask the error message if `.report('custom message')` is called in the chain.

For a sync `formatMessage(...): string`, `.unwrap()` is `string`. For an async
`chargeCard(...): Promise<Receipt>`, it is `Receipt | Promise<Receipt>`.

#### `.default<D>(defaultValue: D): Omit<PublicTry<TReturn, TArgs>, 'value'> & { value(): MaybePromise<TReturn, Awaited<TReturn> | D> }`

Set a default value that will be returned by `.value()` when an exception occurs,
and narrow `.value()` to drop `undefined`. For a sync `formatMessage`,
`.default('fallback').value()` is `string`; for an async `fetchUser`,
`.default(null).value()` is `User | null | Promise<User | null>`.

Call `.default()` last in a chain: the narrowing lives on the object it returns,
and a following configuration method returns `PublicTry<TReturn, TArgs>`, whose
`.value()` includes `undefined`.

#### `.value(): MaybePromise<TReturn, Awaited<TReturn> | undefined>`

Execute the function and return the result, the configured default value, or `undefined` if an error occurs.

For a sync `formatMessage(...): string`, `.value()` is `string | undefined`. For
an async `fetchUser(...): Promise<User>`, it is
`User | undefined | Promise<User | undefined>`.

#### `.error(): MaybePromise<TReturn, Error | undefined>`

Execute the function and return the error if one occurred, or `undefined` if successful. If `.report()` was configured, the error is reported before being returned.

For a sync `formatMessage(...): string`, `.error()` is `Error | undefined`. For
an async `fetchUser(...): Promise<User>`, it is
`Error | undefined | Promise<Error | undefined>`.

#### `.result(): MaybePromise<TReturn, TryResult<TReturn>>`

Execute the function and return a discriminated result object:
`{ success: true; value: Awaited<TReturn> }` or `{ success: false; error: Error }`.
Never throws. If `.report()` was configured, a failure is reported before the
object is returned.

```typescript
const outcome = await new Try(fetchUser, { id: 123 }).result();
const label = outcome.success ? outcome.value.name : outcome.error.message;
```

### Terminal return types

`.unwrap()`, `.value()`, `.error()`, and `.result()` each return
`MaybePromise<TReturn, TValue>`, where `TReturn` is the raw return type of the
wrapped function:

```typescript
type MayReturnPromise<TReturn> =
  Extract<TReturn, PromiseLike<unknown>> extends never ? false : true;

type MaybePromise<TReturn, TValue> =
  MayReturnPromise<TReturn> extends true ? TValue | Promise<TValue> : TValue;
```

A sync function returns a plain value from every terminal — no `Promise` member
appears in the type:

```typescript
const message = new Try(formatMessage, 1, 'Test', true).value(); // string | undefined
const text = new Try(formatMessage, 1, 'Test', true).unwrap(); // string
const failure = new Try(formatMessage, 1, 'Test', true).error(); // Error | undefined
```

A function whose return type contains a Promise member returns
`TValue | Promise<TValue>`, because such a function can throw synchronously
before it creates a Promise. `await` accepts both shapes:

```typescript
const user = await new Try(fetchUser, { id: 123 }).value(); // User | undefined
const error = await new Try(fetchUser, { id: 123 }).error(); // Error | undefined
```

Callers that need a `Promise` — to chain `.then()` or to satisfy a
`Promise<T>` annotation — normalize explicitly:

```typescript
Promise.resolve(new Try(fetchUser, { id: 123 }).value()).then(handleUser);
```

`.finally()` is on the public type surface only when the wrapped function's
return type is fully Promise-like.

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

## Features

- 🚀 **Promise-like interface** - Can be awaited directly
- 🔍 **Opt-in Sentry integration** - Errors are reported when `.report('message')` is in the chain
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
