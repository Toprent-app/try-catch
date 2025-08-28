# Try-Catch Library Examples

This directory contains comprehensive examples demonstrating all features and usage patterns of the try-catch library.

## Available Examples

### 1. `comprehensive-examples.ts`
**The main examples file** - A complete demonstration of all library features including:

- **Basic Usage Patterns**: Different parameter types, error handling fundamentals
- **Error Handling Strategies**: `.unwrap()`, `.value()`, `.error()`, `.result()`, default values
- **Breadcrumb Patterns**: Key extraction, transformers, object syntax, mixed strategies
- **Platform-Specific Examples**: Node.js, Browser, and Next.js specific usage
- **Real-World Service Patterns**: API clients, service layers, repository pattern
- **Advanced Configuration**: Debug logging, finally callbacks, error type filtering, complex tagging
- **Testing Patterns**: Custom reporters, performance testing, error validation

### 2. `custom-reporter.ts`
Demonstrates how to create and use custom error reporters instead of the default Sentry integration.

## Running the Examples

### Prerequisites
- Node.js >= 18
- This project's dependencies installed (`npm install`)

### Quick Start

```bash
# Run the comprehensive examples (recommended)
npx tsx examples/comprehensive-examples.ts

# Alternative with ts-node (requires building first)
npm run build
npx ts-node examples/comprehensive-examples.ts

# Run custom reporter example
npx tsx examples/custom-reporter.ts
```

### Building First (Optional)
If you encounter module resolution issues, build the project first:

```bash
npm run build
```

## What You'll Learn

### Basic Usage
```typescript
// Simple async error handling
const user = await new Try(fetchUser, 'user-123').value();

// Multiple parameter types
const message = await new Try(formatMessage, 42, 'Hello', true).value();

// Object parameters with breadcrumbs
const result = await new Try(updateUser, userData, options)
  .breadcrumbs(['userId', 'email'])
  .report('User update failed')
  .value();
```

### Error Handling Strategies
```typescript
// 1. Throw on error
const result = await new Try(riskyOperation).unwrap();

// 2. Return undefined on error
const result = await new Try(riskyOperation).value();

// 3. Get error as value
const error = await new Try(riskyOperation).error();

// 4. Discriminated union result
const result = await new Try(riskyOperation).result();
if (result.success) {
  console.log(result.value);
} else {
  console.log(result.error);
}
```

### Breadcrumb Configuration
```typescript
// Extract keys from first object parameter
.breadcrumbs(['userId', 'email'])

// Transformer functions for any parameter types
.breadcrumbs(
  (id) => ({ userId: id }),
  (data) => ({ hasEmail: !!data.email })
)

// Object syntax with parameter indices
.breadcrumbs({
  0: (url) => ({ endpoint: url }),
  1: ['userId', 'email'],
  2: (opts) => ({ optionCount: Object.keys(opts).length })
})

// Extractor objects for advanced control
.breadcrumbs([
  { param: 0, as: 'value' },
  { param: 1, keys: ['id', 'name'] },
  { param: 2, transform: (data) => ({ count: data.length }) }
])
```

### Real-World Patterns
```typescript
// Service layer with comprehensive error handling
class UserService {
  async findById(id: string): Promise<User | null> {
    return new Try(this.apiClient.get, `/users/${id}`)
      .tag('service', 'user')
      .tag('operation', 'findById')
      .breadcrumbs([{ param: 0, as: 'value' }])
      .report('Failed to find user by ID')
      .value() ?? null;
  }
}

// API client with automatic retry and error reporting
class ApiClient {
  async get<T>(endpoint: string): Promise<T | null> {
    return new Try(this.makeRequest, 'GET', endpoint)
      .tag('method', 'GET')
      .breadcrumbs([
        { param: 0, as: 'value' },
        { param: 1, as: 'value' }
      ])
      .report(`Failed to GET ${endpoint}`)
      .value();
  }
}
```

### Testing Patterns
```typescript
// Custom test reporter
class TestReporter implements Reporter {
  reports: Array<{ error: Error; config: ErrorReportConfig }> = [];

  report(error: Error, config: ErrorReportConfig): void {
    this.reports.push({ error, config });
  }

  // ... other methods
}

// Set up for testing
Try.setDefaultReporter(new TestReporter());

// Test your code
await new Try(riskyFunction)
  .report('Test error')
  .value();

// Verify error reporting
expect(testReporter.reports).toHaveLength(1);
```

## Example Output

When you run `comprehensive-examples.ts`, you'll see detailed console output showing:

- ✅ Successful operations and their results
- 📊 Error reports with breadcrumb data
- 🍞 Breadcrumb extraction in action
- 🧹 Cleanup operations
- Performance metrics
- Type safety demonstrations

## Platform-Specific Usage

The examples show how to import and use the library for different platforms:

```typescript
// Node.js
import { Try } from '../src/node';

// Browser
import { Try } from '../src/browser';

// Next.js
import { Try } from '../src/nextjs';
```

## Next Steps

1. **Run the examples** to see the library in action
2. **Adapt the patterns** to your specific use cases
3. **Create custom reporters** for your error tracking needs
4. **Implement service layers** using the demonstrated patterns
5. **Write tests** using the testing patterns shown

## Contributing

If you have additional example patterns that would be helpful, please contribute them to this directory following the established patterns and documentation style.
