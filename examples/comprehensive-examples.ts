/**
 * Comprehensive Examples for Try-Catch Library
 *
 * This file demonstrates all key features and usage patterns of the try-catch library,
 * including basic usage, error handling strategies, breadcrumb patterns, platform-specific
 * implementations, real-world patterns, and advanced configuration.
 *
 * Run with: npx ts-node examples/comprehensive-examples.ts
 */

import { Try, Reporter, ErrorReportConfig, NoopReporter } from '../src/core';

// =============================================================================
// SECTION 1: BASIC USAGE PATTERNS
// =============================================================================

console.log('='.repeat(80));
console.log('SECTION 1: BASIC USAGE PATTERNS');
console.log('='.repeat(80));

// Mock data types for examples
interface User {
  id: string;
  name: string;
  email: string;
  age?: number;
}

interface UserData {
  name: string;
  email: string;
  age?: number;
}

interface CreateUserData extends UserData {
  password: string;
}

interface UpdateOptions {
  validateOnly?: boolean;
  skipNotification?: boolean;
}

// Mock async functions that might fail
async function fetchUser(id: string): Promise<User> {
  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

  if (id === 'invalid') {
    throw new Error(`User not found: ${id}`);
  }

  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    age: Math.floor(Math.random() * 50) + 20
  };
}

async function updateUser(userData: UserData, options: UpdateOptions = {}): Promise<User> {
  await new Promise(resolve => setTimeout(resolve, 50));

  if (!userData.email.includes('@')) {
    throw new Error('Invalid email format');
  }

  if (options.validateOnly) {
    throw new Error('Validation only mode - no actual update');
  }

  return {
    id: 'updated-user',
    ...userData
  };
}

function formatMessage(id: number, message: string, urgent: boolean): string {
  if (id < 0) {
    throw new Error('Invalid message ID');
  }

  const prefix = urgent ? '[URGENT]' : '[INFO]';
  return `${prefix} #${id}: ${message}`;
}

async function processData(input: string): Promise<string> {
  if (input.length === 0) {
    throw new Error('Empty input not allowed');
  }
  return input.toUpperCase();
}

// Basic usage demonstrations
async function demonstrateBasicUsage() {
  console.log('\n--- Basic Usage Patterns ---');

  // 1. Simple async function with string parameter
  console.log('\n1. Simple async function:');
  const user = await new Try(fetchUser, 'user-123').value();
  console.log('✅ Fetched user:', user?.name);

  // 2. Function with multiple parameter types
  console.log('\n2. Multiple parameter types:');
  const message = await new Try(formatMessage, 42, 'System ready', true).value();
  console.log('✅ Formatted message:', message);

  // 3. Function with object parameters
  console.log('\n3. Object parameters:');
  const updatedUser = await new Try(updateUser,
    { name: 'John Doe', email: 'john@example.com' },
    { validateOnly: false }
  ).value();
  console.log('✅ Updated user:', updatedUser?.name);

  // 4. Handling errors gracefully
  console.log('\n4. Error handling:');
  const invalidUser = await new Try(fetchUser, 'invalid').value();
  console.log('✅ Invalid user result (should be undefined):', invalidUser);
}

// =============================================================================
// SECTION 2: ERROR HANDLING STRATEGIES
// =============================================================================

async function demonstrateErrorStrategies() {
  console.log('\n--- Error Handling Strategies ---');

  // Strategy 1: .unwrap() - Let errors bubble up
  console.log('\n1. Unwrap Strategy (throws errors):');
  try {
    await new Try(fetchUser, 'invalid').unwrap();
  } catch (error) {
    console.log('✅ Caught error from unwrap():', (error as Error).message);
  }

  // Strategy 2: .value() - Return undefined on error
  console.log('\n2. Value Strategy (returns undefined):');
  const safeResult = await new Try(fetchUser, 'invalid').value();
  console.log('✅ Safe result:', safeResult); // undefined

  // Strategy 3: .error() - Get error as value
  console.log('\n3. Error Strategy (error as value):');
  const error = await new Try(fetchUser, 'invalid').error();
  console.log('✅ Error object:', error?.message);

  // Strategy 4: .result() - Discriminated union
  console.log('\n4. Result Strategy (discriminated union):');
  const result = await new Try(fetchUser, 'invalid').result();
  if (result.success) {
    console.log('✅ Success:', result.value.name);
  } else {
    console.log('✅ Error result:', result.error.message);
  }

  // Strategy 5: Default values
  console.log('\n5. Default Values:');
  const userWithDefault = await new Try(fetchUser, 'invalid')
    .default({ id: 'default', name: 'Default User', email: 'default@example.com' })
    .value();
  console.log('✅ User with default:', userWithDefault?.name);
}

// =============================================================================
// SECTION 3: BREADCRUMB PATTERNS
// =============================================================================

async function demonstrateBreadcrumbPatterns() {
  console.log('\n--- Breadcrumb Patterns ---');

  // Setup a test reporter to see breadcrumbs
  class TestReporter implements Reporter {
    report(error: Error, config: ErrorReportConfig): void {
      console.log('📊 Error Report:', {
        message: config.message,
        error: error.message,
        breadcrumbs: config.breadcrumbData,
        tags: config.tags
      });
    }

    addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void {
      console.log('🍞 Breadcrumbs added:', { function: functionName, data });
    }

    createWrappedError(error: Error, message: string): Error {
      return new Error(`${message}: ${error.message}`);
    }
  }

  Try.setDefaultReporter(new TestReporter());

  console.log('\n1. Simple key extraction:');
  await new Try(updateUser,
    { name: 'John', email: 'john@example.com', age: 30 },
    { validateOnly: true }
  )
    .breadcrumbs(['name', 'email'])
    .report('User update failed')
    .value();

  console.log('\n2. Transformer function breadcrumb extraction:');
  await new Try(formatMessage, 999, 'Test message', true)
    .breadcrumbs(
      (id: number) => ({ messageId: id }),       // Transform first param
      (msg: string) => ({ content: msg }),       // Transform second param
      (urgent: boolean) => ({ isUrgent: urgent }) // Transform third param
    )
    .report('Message formatting failed')
    .value();

  console.log('\n3. Object syntax with transformers:');
  await new Try(updateUser,
    { name: 'Jane', email: 'invalid-email', age: 25 },
    { validateOnly: false, skipNotification: true }
  )
    .breadcrumbs({
      0: ['name', 'age'],  // Extract keys from first parameter
      1: (opts: any) => ({ hasValidation: !!opts.validateOnly, optionCount: Object.keys(opts).length })
    })
    .report('Complex update failed')
    .value();

  console.log('\n4. Mixed extraction strategies using extractor objects:');
  async function processOrder(orderId: string, customerData: { id: number, type: string }, urgent: boolean) {
    if (orderId === 'invalid') throw new Error('Invalid order');
    return { orderId, processed: true };
  }

  await new Try(processOrder, 'invalid', { id: 123, type: 'premium' }, true)
    .breadcrumbs([
      { param: 0, as: 'value' },      // Extract orderId as value
      { param: 1, keys: ['id', 'type'] },  // Extract keys from customerData
      { param: 2, as: 'value' }       // Extract urgent as value
    ])
    .report('Order processing failed')
    .value();

  // Reset reporter
  Try.setDefaultReporter(new NoopReporter());
}

// =============================================================================
// SECTION 4: PLATFORM-SPECIFIC EXAMPLES
// =============================================================================

async function demonstratePlatformSpecific() {
  console.log('\n--- Platform-Specific Examples ---');

  // Note: These would use different imports in real usage
  // import { Try } from '../src/node';      // For Node.js
  // import { Try } from '../src/browser';   // For Browser
  // import { Try } from '../src/nextjs';    // For Next.js

  console.log('\n1. Node.js-style file operations:');
  async function readConfig(configPath: string): Promise<any> {
    if (configPath === 'missing.json') {
      throw new Error('ENOENT: no such file or directory');
    }
    return { database: 'postgres://localhost' };
  }

  const config = await new Try(readConfig, 'app.json')
    .tag('platform', 'nodejs')
    .tag('operation', 'file-read')
    .default({})
    .value();
  console.log('✅ Config loaded:', config);

  console.log('\n2. Browser-style API calls:');
  async function fetchFromAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (endpoint.includes('error')) {
      throw new Error('Network request failed');
    }
    return { data: 'API response', status: 200 };
  }

  const apiResult = await new Try(fetchFromAPI, '/api/users', { method: 'GET' })
    .tag('platform', 'browser')
    .tag('component', 'api-client')
    .breadcrumbs([
      { param: 0, as: 'value' },
      { param: 1, transform: (opts: any) => ({ method: opts.method || 'GET' }) }
    ])
    .default(null)
    .value();
  console.log('✅ API result:', apiResult);

  console.log('\n3. Next.js-style server operations:');
  async function getServerSideData(userId: string): Promise<any> {
    if (userId === 'unauthorized') {
      throw new Error('Access denied');
    }
    return { userData: `Data for ${userId}`, serverRendered: true };
  }

  const serverData = await new Try(getServerSideData, 'user-456')
    .tag('platform', 'nextjs')
    .tag('side', 'server')
    .breadcrumbs([{ param: 0, as: 'value' }])
    .default(null)
    .value();
  console.log('✅ Server data:', serverData);
}

// =============================================================================
// SECTION 5: CLASS METHOD BINDING PATTERNS
// =============================================================================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
    return this.makeRequest('GET', endpoint, undefined, headers);
  }

  async post<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<T> {
    return this.makeRequest('POST', endpoint, body, headers);
  }

  async put<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<T> {
    return this.makeRequest('PUT', endpoint, body, headers);
  }

  async delete<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
    return this.makeRequest('DELETE', endpoint, undefined, headers);
  }

  private async makeRequest(method: string, endpoint: string, body?: any, headers: Record<string, string> = {}): Promise<any> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 50));

    if (endpoint.includes('error')) {
      throw new Error(`HTTP ${method} request failed for ${this.baseUrl}${endpoint}`);
    }

    return {
      data: `Response from ${method} ${this.baseUrl}${endpoint}`,
      body,
      timestamp: new Date().toISOString()
    };
  }
}

class UserRepository {
  private apiClient: ApiClient;
  private boundGet: <T>(endpoint: string, headers?: Record<string, string>) => Promise<T>;
  private boundPost: <T>(endpoint: string, body: any, headers?: Record<string, string>) => Promise<T>;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    // ✅ SOLUTION 4: Initialize bound methods in constructor
    this.boundGet = this.apiClient.get.bind(this.apiClient);
    this.boundPost = this.apiClient.post.bind(this.apiClient);
  }

  // ❌ WRONG: This will lose the `this` context binding
  async findByIdWrong(id: string): Promise<User | null> {
    // This approach will cause "Cannot read properties of undefined" errors
    // because this.apiClient.get loses its `this` binding when passed as a reference
    const result = await new Try(this.apiClient.get<User>, `/users/${id}`)
      .tag('repository', 'user')
      .tag('operation', 'findById')
      .report('Failed to find user by ID')
      .value();
    return result ?? null;
  }

  // ✅ SOLUTION 1: Use arrow function wrapper
  async findByIdWithWrapper(id: string): Promise<User | null> {
    const result = await new Try(
      (endpoint: string) => this.apiClient.get<User>(endpoint),
      `/users/${id}`
    )
      .tag('repository', 'user')
      .tag('operation', 'findById')
      .breadcrumbs([{ param: 0, as: 'value' }])
      .report('Failed to find user by ID')
      .value();
    return result ?? null;
  }

  // ✅ SOLUTION 2: Use .bind() method
  async findByIdWithBind(id: string): Promise<User | null> {
    const boundGet = this.apiClient.get.bind(this.apiClient) as <T>(endpoint: string, headers?: Record<string, string>) => Promise<T>;
    const result = await new Try(
      boundGet<User>,
      `/users/${id}`
    )
      .tag('repository', 'user')
      .tag('operation', 'findById')
      .breadcrumbs([{ param: 0, as: 'value' }])
      .report('Failed to find user by ID')
      .value();
    return result ?? null;
  }

  // ✅ SOLUTION 3: Multi-parameter wrapper for complex cases
  async createUser(userData: CreateUserData): Promise<User | null> {
    const result = await new Try(
      (endpoint: string, body: CreateUserData, headers?: Record<string, string>) =>
        this.apiClient.post<User>(endpoint, body, headers),
      '/users',
      userData,
      { 'Content-Type': 'application/json' }
    )
      .tag('repository', 'user')
      .tag('operation', 'create')
      .breadcrumbs({
        0: (endpoint: any) => ({ endpoint }),
        1: ['name', 'email'],
        2: (headers: any) => ({ hasHeaders: !!headers, headerCount: Object.keys(headers || {}).length })
      })
      .report('Failed to create user')
      .value();
    return result ?? null;
  }

  // ✅ SOLUTION 4: Using bound methods stored as class properties (initialized in constructor)
  async updateUserWithBoundMethods(id: string, updates: Partial<UserData>): Promise<User | null> {
    const result = await new Try(
      this.boundPost<User>,
      `/users/${id}`,
      updates
    )
      .tag('repository', 'user')
      .tag('operation', 'update')
      .breadcrumbs([
        { param: 0, as: 'value' },
        {
          param: 1, transform: (updates: any) => ({
            updateFields: Object.keys(updates),
            fieldCount: Object.keys(updates).length
          })
        }
      ])
      .report(`Failed to update user ${id}`)
      .value();
    return result ?? null;
  }
}

// Service class that properly handles method binding
class UserService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  // ✅ Proper delegation with error context
  async findById(id: string): Promise<User | null> {
    const result = await new Try(
      (userId: string) => this.userRepository.findByIdWithWrapper(userId),
      id
    )
      .tag('service', 'user')
      .tag('layer', 'business-logic')
      .breadcrumbs([{ param: 0, as: 'value' }])
      .report('User service failed to find user')
      .value();
    return result ?? null;
  }

  async createUser(userData: CreateUserData): Promise<User | null> {
    // Add validation logic here
    if (!userData.email.includes('@')) {
      throw new Error('Invalid email format');
    }

    const result = await new Try(
      (data: CreateUserData) => this.userRepository.createUser(data),
      userData
    )
      .tag('service', 'user')
      .tag('layer', 'business-logic')
      .breadcrumbs([{ param: 0, keys: ['name', 'email'] }])
      .report('User service failed to create user')
      .value();
    return result ?? null;
  }
}

async function demonstrateClassMethodBinding() {
  console.log('\n--- Class Method Binding Patterns ---');

  const apiClient = new ApiClient('https://api.example.com');
  const userRepository = new UserRepository(apiClient);
  const userService = new UserService(userRepository);

  console.log('\n1. Testing arrow function wrapper approach:');
  const user1 = await userRepository.findByIdWithWrapper('user-123');
  console.log('✅ User found with wrapper:', user1);

  console.log('\n2. Testing .bind() approach:');
  const user2 = await userRepository.findByIdWithBind('user-456');
  console.log('✅ User found with bind:', user2);

  console.log('\n3. Testing multi-parameter wrapper:');
  const newUser = await userRepository.createUser({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'secure123'
  });
  console.log('✅ User created with multi-param wrapper:', newUser);

  console.log('\n4. Testing bound methods:');
  const updatedUser = await userRepository.updateUserWithBoundMethods('user-789', {
    name: 'Jane Smith',
    age: 30
  });
  console.log('✅ User updated with bound methods:', updatedUser);

  console.log('\n5. Testing service layer delegation:');
  const serviceUser = await userService.findById('user-service-test');
  console.log('✅ User found via service:', serviceUser);

  console.log('\n6. Demonstrating the wrong approach (commented out to avoid errors):');
  console.log('// ❌ This would fail:');
  console.log('// await new Try(this.apiClient.post<User>, \'/users\', userData)');
  console.log('// Error: Cannot read properties of undefined (reading \'makeRequest\')');
  console.log('\n✅ Key takeaway: Always wrap class methods to preserve \'this\' context!');
}

// =============================================================================
// SECTION 6: REAL-WORLD SERVICE PATTERNS
// =============================================================================

// Example of a properly implemented API client for real-world patterns
class RealWorldApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // ✅ Proper implementation using private method with correct binding
  async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T | null> {
    const result = await new Try(
      (method: string, ep: string, body: any, h: Record<string, string>) => this.makeRequest(method, ep, body, h),
      'GET', endpoint, undefined, headers
    )
      .tag('method', 'GET')
      .tag('client', 'api')
      .breadcrumbs([
        { param: 0, as: 'value' },  // httpMethod
        { param: 1, as: 'value' },  // endpoint
        { param: 3, transform: (h: any) => ({ headerCount: Object.keys(h).length, hasAuth: !!h.authorization }) }
      ])
      .report(`Failed to GET ${endpoint}`)
      .value();
    return result;
  }

  async post<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<T | null> {
    const result = await new Try(
      (method: string, ep: string, b: any, h: Record<string, string>) => this.makeRequest(method, ep, b, h),
      'POST', endpoint, body, headers
    )
      .tag('method', 'POST')
      .tag('client', 'api')
      .breadcrumbs({
        0: (method: any) => ({ httpMethod: method }),
        1: (endpoint: any) => ({ endpoint }),
        2: (body: any) => ({ bodyType: typeof body, hasData: !!body }),
        3: (headers: any) => ({ headerCount: Object.keys(headers).length })
      })
      .report(`Failed to POST ${endpoint}`)
      .value();
    return result;
  }

  private async makeRequest(method: string, endpoint: string, body?: any, headers: Record<string, string> = {}): Promise<any> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 50));

    if (endpoint.includes('error')) {
      throw new Error(`HTTP ${method} request failed`);
    }

    return {
      data: `Response from ${method} ${endpoint}`,
      timestamp: new Date().toISOString()
    };
  }
}

class RealWorldUserService {
  private apiClient: RealWorldApiClient;

  constructor(apiClient: RealWorldApiClient) {
    this.apiClient = apiClient;
  }

  // ✅ Proper implementation using wrapper function
  async findById(id: string): Promise<User | null> {
    const result = await new Try(
      (endpoint: string, headers?: Record<string, string>) => this.apiClient.get<User>(endpoint, headers),
      `/users/${id}`
    )
      .tag('service', 'user')
      .tag('operation', 'findById')
      .breadcrumbs([{ param: 0, as: 'value' }])
      .report('Failed to find user by ID')
      .value();
    return result ?? null;
  }

  async create(userData: CreateUserData): Promise<User | null> {
    const result = await new Try(
      (endpoint: string, body: CreateUserData, headers?: Record<string, string>) =>
        this.apiClient.post<User>(endpoint, body, headers),
      '/users',
      userData
    )
      .tag('service', 'user')
      .tag('operation', 'create')
      .breadcrumbs({
        0: (endpoint: any) => ({ endpoint }),
        1: ['name', 'email']
      })
      .report('Failed to create user')
      .value();
    return result ?? null;
  }

  async update(id: string, updates: Partial<UserData>): Promise<User | null> {
    const result = await new Try(
      (endpoint: string, body: Partial<UserData>) => this.apiClient.post<User>(endpoint, body),
      `/users/${id}`,
      updates
    )
      .tag('service', 'user')
      .tag('operation', 'update')
      .breadcrumbs([
        { param: 0, as: 'value' },  // endpoint with userId
        {
          param: 1, transform: (updates: any) => ({
            updateFields: Object.keys(updates),
            fieldCount: Object.keys(updates).length
          })
        }
      ])
      .report(`Failed to update user ${id}`)
      .value();
    return result ?? null;
  }
}

async function demonstrateRealWorldPatterns() {
  console.log('\n--- Real-World Service Patterns ---');

  const apiClient = new RealWorldApiClient('https://api.example.com');
  const userService = new RealWorldUserService(apiClient);

  console.log('\n1. API Client with error handling:');
  const userData = await apiClient.get('/users/123');
  console.log('✅ API Client result:', userData);

  console.log('\n2. Service layer with comprehensive error handling:');
  const user = await userService.findById('user-789');
  console.log('✅ User service result:', user);

  console.log('\n3. Create operation with validation:');
  const newUser = await userService.create({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    password: 'secure123'
  });
  console.log('✅ Created user:', newUser);

  console.log('\n4. Update operation with partial data:');
  const updatedUser = await userService.update('user-456', {
    name: 'Alice Smith',
    age: 28
  });
  console.log('✅ Updated user:', updatedUser);
}

// =============================================================================
// SECTION 7: ADVANCED CONFIGURATION
// =============================================================================

async function demonstrateAdvancedConfiguration() {
  console.log('\n--- Advanced Configuration ---');

  // 1. Debug logging
  console.log('\n1. Debug logging:');
  const debugResult = await new Try(processData, '')
    .debug(true) // Enable debug logging
    .tag('feature', 'debug')
    .report('Processing failed with debug enabled')
    .value();
  console.log('✅ Debug result:', debugResult);

  // 2. Finally callbacks for cleanup
  console.log('\n2. Finally callbacks:');
  let cleanupCalled = false;
  const resultWithCleanup = await new Try(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return 'Operation completed';
  })
    .finally(() => {
      cleanupCalled = true;
      console.log('🧹 Cleanup executed');
    })
    .value();
  console.log('✅ Result with cleanup:', resultWithCleanup);
  console.log('✅ Cleanup was called:', cleanupCalled);

  // 3. Error type filtering
  console.log('\n3. Error type filtering:');
  class ValidationError extends Error {
    name = 'ValidationError';
  }

  class AuthError extends Error {
    name = 'AuthError';
  }

  // Configure certain errors to be thrown through without wrapping
  Try.throwThroughErrorTypes(['ValidationError', 'AuthError']);

  async function validateInput(input: string): Promise<string> {
    if (input.length < 3) {
      throw new ValidationError('Input too short');
    }
    return input;
  }

  try {
    await new Try(validateInput, 'ab')
      .report('Custom validation message')
      .unwrap();
  } catch (error: any) {
    console.log('✅ Error type preserved:', error.constructor.name);
    console.log('✅ Error message preserved:', error.message);
  }

  // 4. Complex tagging strategies
  console.log('\n4. Complex tagging:');
  const environment = 'development';
  const version = '1.2.3';

  await new Try(fetchUser, 'test-user')
    .tags({
      environment,
      version,
      component: 'user-fetcher',
      correlationId: Math.random().toString(36)
    })
    .tag('timestamp', new Date().toISOString())
    .debug(environment === 'development')
    .report('User fetch failed')
    .value();

  console.log('✅ Complex tagging demonstrated');
}

// =============================================================================
// SECTION 8: TESTING PATTERNS
// =============================================================================

class TestReporter implements Reporter {
  public reports: Array<{ error: Error; config: ErrorReportConfig }> = [];
  public breadcrumbs: Array<{ data: Record<string, unknown>; functionName?: string }> = [];

  report(error: Error, config: ErrorReportConfig): void {
    this.reports.push({ error, config });
  }

  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void {
    this.breadcrumbs.push({ data, functionName });
  }

  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(`${message}: ${error.message}`);
    wrapped.cause = error;
    return wrapped;
  }

  reset(): void {
    this.reports = [];
    this.breadcrumbs = [];
  }
}

async function demonstrateTestingPatterns() {
  console.log('\n--- Testing Patterns ---');

  const testReporter = new TestReporter();
  Try.setDefaultReporter(testReporter);

  console.log('\n1. Testing error reporting:');
  await new Try(fetchUser, 'invalid')
    .tag('test', 'error-reporting')
    .breadcrumbs([{ param: 0, as: 'value' }])
    .report('Test error report')
    .value();

  console.log('✅ Error reports captured:', testReporter.reports.length);
  console.log('✅ Breadcrumbs captured:', testReporter.breadcrumbs.length);

  console.log('\n2. Testing breadcrumb extraction:');
  testReporter.reset();

  await new Try(updateUser,
    { name: 'Test User', email: 'test@example.com' },
    { validateOnly: true }
  )
    .breadcrumbs(['name', 'email'])
    .report('Test breadcrumb extraction')
    .value();

  const lastReport = testReporter.reports[0];
  console.log('✅ Extracted breadcrumbs:', lastReport?.config.breadcrumbData);

  console.log('\n3. Performance testing pattern:');
  const startTime = Date.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    await new Try(processData, `test-${i}`).value();
  }

  const endTime = Date.now();
  const avgTime = (endTime - startTime) / iterations;
  console.log(`✅ Average execution time: ${avgTime.toFixed(2)}ms per call`);

  // Reset to no-op reporter
  Try.setDefaultReporter(new NoopReporter());
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function runComprehensiveExamples() {
  console.log('🚀 Starting Try-Catch Library Comprehensive Examples\n');

  try {
    await demonstrateBasicUsage();
    await demonstrateErrorStrategies();
    await demonstrateBreadcrumbPatterns();
    await demonstratePlatformSpecific();
    await demonstrateClassMethodBinding();
    await demonstrateRealWorldPatterns();
    await demonstrateAdvancedConfiguration();
    await demonstrateTestingPatterns();

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL EXAMPLES COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
    process.exit(1);
  }
}

// Export for testing or run directly
if (require.main === module) {
  runComprehensiveExamples();
}

export {
  runComprehensiveExamples,
  ApiClient,
  UserService,
  TestReporter
};
