import { Try, Reporter, ErrorReportConfig, NoopReporter } from '../src/core';

/**
 * Example custom reporter that logs to console instead of Sentry
 */
class ConsoleReporter implements Reporter {
  report(error: Error, config: ErrorReportConfig): void {
    console.error('Error Report:', {
      message: config.message || error.message,
      error: error.name,
      stack: error.stack,
      tags: config.tags,
      functionName: config.functionName,
      breadcrumbs: config.breadcrumbData,
    });
  }

  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void {
    console.log('Breadcrumbs:', {
      function: functionName,
      data,
    });
  }

  createWrappedError(error: Error, message: string): Error {
    const wrappedError = new Error(`${message}: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.stack = error.stack;
    return wrappedError;
  }
}

/**
 * Example showing how to use different reporters
 */
async function demonstrateReporters() {
  // Example 1: Using NoopReporter (no reporting)
  Try.setDefaultReporter(new NoopReporter());

  const result1 = await new Try(() => {
    throw new Error('Test error 1');
  })
    .report('This error won\'t be reported anywhere')
    .value();

  console.log('Result 1 (NoopReporter):', result1); // undefined

  // Example 2: Using ConsoleReporter (logs to console)
  Try.setDefaultReporter(new ConsoleReporter());

  const result2 = await new Try(() => {
    throw new Error('Test error 2');
  })
    .report('This error will be logged to console')
    .tag('component', 'demo')
    .value();

  console.log('Result 2 (ConsoleReporter):', result2); // undefined

  // Example 3: Success case
  const result3 = await new Try(() => {
    return 'Success!';
  })
    .report('This won\'t be called since there\'s no error')
    .value();

  console.log('Result 3 (Success):', result3); // "Success!"
}

demonstrateReporters();
