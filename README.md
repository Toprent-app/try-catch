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

// Try with flexible logic, the function will be executed once.
// Don't await the constructor — keep the instance, then await its terminals.
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

The `Try` class provides a fluent interface for handling async operations with automatic error reporting to Sentry. Configuration methods mutate and return the **same** instance (a fluent builder), and the wrapped function runs **at most once** — its result is cached.

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

All configuration methods return the same `Try` instance (a mutable builder), enabling method chaining:

#### `.report(message: string): Try<T, TArgs>`

Report to Sentry with a custom error message, attach the original error as a cause.

> `.report()` records the reporting intent; the error is sent to Sentry when a terminal runs and the operation failed. Every terminal reports — `.value()`, `.unwrap()`, `.error()`, `.result()`, and `await` — so pair `.report()` with whichever return shape you need: `.value()` returns the value (`undefined` on failure), `.unwrap()` re-throws, `.error()` returns the `Error`, `.result()` returns the `{ success, ... }` object.

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

Add multiple tags for Sentry error reporting. Tags are merged with any previously set tags; on a key conflict the later call wins.

#### `.debug(enabled?: boolean): Try<T, TArgs>`

Enable debug logging to console. When enabled, errors will be logged to console.error.

#### `.finally(callback: () => void | Promise<void>): Try<T, TArgs>`

Register a callback that runs once after the wrapped function settles (on success or failure), mirroring `Promise.prototype.finally`. It runs synchronously for sync functions and is awaited for async ones, before any error is re-thrown by `.unwrap()`.

### Execution Methods

#### `.unwrap(): T | Promise<Awaited<T>>`

Execute the function and return the result. Throws the original error if one occurred. Will mask the error message if `.report('custom message')` is called in the chain.

#### `.default<Return>(defaultValue: Return): Try<T, TArgs>`

Set a default value that will be returned by `.value()` when an exception occurs.

#### `.value(): T | undefined | Promise<Awaited<T> | undefined>`

Execute the function and return the result, the configured default value, or `undefined` if an error occurs.

#### `.error(): Error | undefined | Promise<Error | undefined>`

Execute the function and return the error if one occurred, or `undefined` if successful. If `.report()` was configured, the error is reported before being returned.

#### `.result(): TryResult<T> | Promise<TryResult<T>>`

Execute the function and return a discriminated union you can pattern-match on: `{ success: true, value }` or `{ success: false, error }`. Never throws; reports to Sentry when `.report()` is set and the function fails.

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

## Features

- 🚀 **Promise-like interface** - Can be awaited directly (equivalent to `.value()`: resolves to the result, the configured default, or `undefined` — awaiting **never throws/rejects and discards the error**; use `.unwrap()` to throw or `.error()`/`.result()` to inspect)
- 🔍 **Sentry integration** - Errors are reported to Sentry when you call `.report()` and the operation fails, on any terminal (`.value()`, `.unwrap()`, `.error()`, `.result()`, or `await`)
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
