# Comprehensive Examples - Try-Catch Library

## Overview

This design document outlines comprehensive code examples to be added to the `/examples` folder for the try-catch library. These examples will demonstrate real-world usage patterns, different parameter types, error handling strategies, and platform-specific implementations.

## Examples Architecture

The examples will be organized to showcase different aspects of the library:

```mermaid
graph TB
    A[Basic Usage Examples] --> B[Parameter Types]
    A --> C[Error Strategies]
    A --> D[Breadcrumb Patterns]

    E[Platform Examples] --> F[Node.js Examples]
    E --> G[Browser Examples]
    E --> H[Next.js Examples]

    I[Real-World Examples] --> J[API Client]
    I --> K[Database Operations]
    I --> L[Form Validation]
    I --> M[Background Jobs]

    N[Testing Examples] --> O[Unit Tests]
    N --> P[Custom Reporters]

## File 1: basic-usage.ts

**Purpose**: Demonstrate fundamental usage patterns and error handling strategies

**Key Features**:
- Different parameter types (string, number, object, mixed)
- All four error handling strategies: `.unwrap()`, `.value()`, `.error()`, `.result()`
- Basic breadcrumb extraction
- Simple tagging

**Example Functions**:
```typescript
// Async function that might fail
async function fetchUser(id: string): Promise<User>

// Function with multiple parameter types
function formatMessage(id: number, message: string, urgent: boolean): string

// Function with object parameters
async function updateUser(userData: UserData, options: Options): Promise<User>
```

**Demonstrations**:
- Basic wrapping: `new Try(fetchUser, 'user-123').value()`
- Error strategies comparison
- Parameter type handling
- Simple breadcrumb extraction from object parameters

## File 2: breadcrumb-patterns.ts

**Purpose**: Showcase advanced breadcrumb configuration patterns

**Key Features**:
- Backward compatibility breadcrumbs: `['key1', 'key2']`
- Transformer functions for any parameter types
- Mixed extraction strategies
- Object syntax with parameter indices

**Example Scenarios**:
```typescript
// String, number, object parameters
function processOrder(orderId: string, customerData: object, options: object)

// API call with different parameter types
function apiCall(endpoint: string, payload: object, headers: object)

// Distance calculation with primitives
function calculateDistance(x: number, y: number, unit: string)
```

**Breadcrumb Demonstrations**:
- Simple key extraction: `.breadcrumbs(['orderId', 'customerId'])`
- Custom transformers: `.breadcrumbs((id) => ({ orderId: id }), (data) => ({ customerType: data.type }))`
- Object syntax: `.breadcrumbs({ 0: (url) => ({ endpoint: url }), 1: ['userId'] })`

## File 3: platform-specific.ts

**Purpose**: Show platform-specific usage for Node.js, Browser, and Next.js

**Key Features**:
- Import statements for each platform
- Platform-specific error scenarios
- Environment-specific tagging
- Conditional debug logging

**Platform Examples**:
- Node.js: File system operations, database connections
- Browser: DOM manipulation, localStorage access, API calls
- Next.js: API routes, server-side operations, client-side handling

**Demonstrations**:
```typescript
// Node.js example
import { Try } from '../src/node';
const result = await new Try(fs.readFile, filePath).value();

// Browser example
import { Try } from '../src/browser';
const data = await new Try(localStorage.getItem, 'key').value();

// Next.js example
import { Try } from '../src/nextjs';
const user = await new Try(fetchFromAPI, endpoint).value();
```

## File 4: real-world-patterns.ts

**Purpose**: Demonstrate practical usage patterns in real applications

**Key Features**:
- API client class implementation
- Database service layer
- Form validation service
- Background job processor
- Repository pattern

**Example Classes**:
```typescript
class ApiClient {
  async get<T>(endpoint: string): Promise<T | null>
  async post<T>(endpoint: string, data: any): Promise<T | null>
}

class UserService {
  async findById(id: string): Promise<User | null>
  async create(userData: CreateUserData): Promise<User | null>
  async update(id: string, updates: Partial<UserData>): Promise<User | null>
}

class FormValidator {
  async validateForm(formData: FormData): Promise<ValidationResult>
}
```

**Patterns Demonstrated**:
- Error boundaries in service layers
- Default value strategies for UI components
- Comprehensive error reporting with context
- Cleanup operations with `.finally()`

## File 5: error-handling-strategies.ts

**Purpose**: Compare and contrast different error handling approaches

**Key Features**:
- Side-by-side comparison of all error handling methods
- Use case recommendations for each strategy
- Performance considerations
- Testing implications

**Strategy Comparisons**:
1. **Unwrap Strategy**: When you want errors to bubble up
2. **Default Value Strategy**: For UI components needing fallback data
3. **Error Inspection Strategy**: For business logic requiring error handling
4. **Result Pattern Strategy**: For functional programming approaches

**Example Scenarios**:
```typescript
// Payment processing with different strategies
class PaymentProcessor {
  // Strategy 1: Let errors bubble up
  async processPaymentStrict(data: PaymentData): Promise<PaymentResult>

  // Strategy 2: Always return usable data
  async processPaymentSafe(data: PaymentData): Promise<PaymentResult>

  // Strategy 3: Inspect errors for business logic
  async processPaymentWithHandling(data: PaymentData): Promise<ProcessingResponse>

  // Strategy 4: Functional result pattern
  async processPaymentFunctional(data: PaymentData): Promise<Result<PaymentResult>>
}
```

## File 6: testing-examples.ts

**Purpose**: Show how to test code that uses Try and how to test Try itself

**Key Features**:
- Custom test reporter implementation
- Unit testing patterns
- Mock error scenarios
- Testing breadcrumb extraction
- Testing error reporting

**Test Patterns**:
```typescript
// Custom reporter for testing
class TestReporter implements Reporter {
  reports: Array<{ error: Error; config: ErrorReportConfig }> = [];
  // ... implementation
}

// Testing service methods
describe('UserService', () => {
  it('should handle database errors gracefully')
  it('should extract correct breadcrumbs')
  it('should report errors with proper tags')
});
```

**Testing Utilities**:
- Reporter spy/mock implementations
- Error scenario generators
- Breadcrumb validation helpers
- Performance testing patterns

## File 7: configuration-examples.ts

**Purpose**: Demonstrate advanced configuration options and customization

**Key Features**:
- Debug logging configuration
- Custom error type handling with `throwThroughErrorTypes`
- Finally callback patterns
- Complex tagging strategies
- Conditional configuration

**Configuration Patterns**:
```typescript
// Environment-based configuration
const debugEnabled = process.env.NODE_ENV === 'development';
const result = await new Try(operation)
  .debug(debugEnabled)
  .tags(getEnvironmentTags())
  .value();

// Custom error handling
Try.throwThroughErrorTypes(['ValidationError', 'AuthError']);

// Complex cleanup operations
const result = await new Try(databaseTransaction)
  .finally(async () => {
    await cleanup();
    await releaseResources();
  })
  .value();
```

**Advanced Features**:
- Environment-specific configuration
- Error type filtering
- Resource cleanup patterns
- Performance monitoring integration
- Custom reporter chaining

## File Structure

Each example file will include:
1. **Header comment** explaining the file's purpose
2. **Import statements** showing proper library usage
3. **Example functions/classes** that demonstrate the patterns
4. **Usage demonstrations** with console.log outputs
5. **Comments** explaining key concepts and best practices
6. **Runnable code** that can be executed with `ts-node`

## Common Patterns Across All Files

- **Error Simulation**: Each file will include functions that intentionally throw errors
- **Success Cases**: Demonstrations of successful operations
- **Console Output**: Clear logging to show results
- **Type Safety**: Full TypeScript type annotations
- **Best Practices**: Comments highlighting recommended approaches
- **Performance Notes**: Where applicable, notes about performance implications
