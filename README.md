# @power-rent/try-catch

A TypeScript utility for simplified async error handling with Sentry integration.

## Installation

```bash
npm install @power-rent/try-catch
```

## Usage

The `Try` class provides a fluent interface for handling async operations with automatic error reporting to Sentry. Each method returns a new instance, making the API immutable and declarative.

### Basic Usage

```typescript
import Try from '@power-rent/try-catch/nextjs';

// Execute and get result (throws on error)
const result = await new Try(asyncFunction, arg1, arg2).unwrap();

// Execute with default value (never throws)
const result = await new Try(asyncFunction, arg1, arg2)
  .default('fallback')
  .value();

// Execute and get error (returns Error or undefined)
const error = await new Try(asyncFunction, arg1, arg2).error();

// Report to Sentry and let the error bubble up
try {
  const result = await new Try(asyncFunction, arg1, arg2)
    .report('Failed to execute business logic')
    .unwrap();
} catch (error) {
  // Handle the error
}
```

### Advanced Usage

```typescript
// Chain multiple configuration methods
const result = await new Try(processUser, { id: 123, name: 'John' })
  .breadcrumbs(['id', 'name'])        // Add these fields as breadcrumbs
  .report('Failed to process user')   // Custom error message
  .tag('operation', 'user-processing') // Add Sentry tag
  .tag('priority', 'high')            // Add another tag
  .default(null)
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
```

## API

### Constructor

```typescript
new Try<T, TArgs>(fn: (...args: TArgs) => T | Promise<T>, ...args: TArgs)
```

- `fn`: The function to execute (can be sync or async)
- `args`: Arguments to pass to the function

### Configuration Methods

All configuration methods return a new `Try` instance, enabling method chaining:

#### `.report(message: string): Try<T, TArgs>`
Attach a custom Sentry error message.

#### `.breadcrumbs(keys: readonly string[]): Try<T, TArgs>`
Record breadcrumbs for the provided parameter keys. Only works when the first argument is an object.

#### `.tag(name: string, value: string): Try<T, TArgs>`
Add a tag for Sentry error reporting. Can be called multiple times to add multiple tags.

### Execution Methods

#### `.unwrap(): Promise<Awaited<T>>`
Execute the function and return the result. Throws the original error if one occurred.

#### `.default<Return>(defaultValue: Return): Try<T, TArgs>`
Set a default value that will be returned by `.value()` when an exception occurs.

#### `.value(): Promise<Awaited<T> | Return | undefined>`
Execute the function and return the result, the configured default value, or `undefined` if an error occurs.

#### `.error(): Promise<Error | undefined>`
Execute the function and return the error if one occurred, or `undefined` if successful.

## Examples

### Error Handling Patterns

```typescript
// Pattern 1: Use default values
const user = await new Try(fetchUser, userId)
  .report('Failed to fetch user')
  .breadcrumbs(['userId'])
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

- 🚀 **Promise-like interface** - Can be awaited directly
- 🔍 **Automatic Sentry integration** - Errors are automatically reported
- 🍞 **Breadcrumb support** - Add context to error reports
- 🏷️ **Tag support** - Add custom tags to Sentry reports
- 🎯 **TypeScript support** - Full type safety
- 🔄 **Flexible error handling** - Choose to ignore, use defaults, inspect errors, or let them bubble up

## Requirements

- Node.js >= 20
- TypeScript >= 4.5 (if using TypeScript)
- Sentry project configured

## License

ISC 
