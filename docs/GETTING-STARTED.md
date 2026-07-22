<!-- generated-by: gsd-doc-writer -->
# Getting Started

## Prerequisites

- Node.js `>= 20` (defined in `package.json` `engines.node`)
- TypeScript `>= 5.0` when using TypeScript (`const` type parameters are used)
- A Sentry SDK for your runtime (`@sentry/node`, `@sentry/browser`, or `@sentry/nextjs` — version `>=8.0.0 <11.0.0`) if you want error reporting. The library works without Sentry via the built-in `NoopReporter`.

## Installation

```bash
npm install @power-rent/try-catch
```

## Choose Your Entry Point

The package ships four entry points. Import the one that matches your runtime. Each environment-specific entry point auto-registers the correct Sentry reporter as a side effect on import.

| Entry point | Import path | Sentry SDK required |
|---|---|---|
| Node.js | `@power-rent/try-catch/node` | `@sentry/node` |
| Browser / bundler | `@power-rent/try-catch/browser` | `@sentry/browser` |
| Next.js | `@power-rent/try-catch/nextjs` | `@sentry/nextjs` |
| Plain / custom reporter | `@power-rent/try-catch` | none |

## First Use by Environment

### Node.js

```typescript
import { Try } from '@power-rent/try-catch/node';

const data = await new Try(fetchFromDatabase, { userId: 42 })
  .report('Failed to fetch user')
  .default(null)
  .value();
```

### Next.js (App Router or Pages Router)

```typescript
import { Try } from '@power-rent/try-catch/nextjs';

export async function GET() {
  const user = await new Try(getUser, requestContext)
    .report('Failed to load user in route handler')
    .default(null)
    .value();

  return Response.json({ user });
}
```

### Browser / Client-Side Bundler

```typescript
import { Try } from '@power-rent/try-catch/browser';

const result = await new Try(callApi, '/api/orders')
  .report('API call failed')
  .default([])
  .value();
```

### Plain (No Sentry / Custom Reporter)

Use the root entry point when you have no Sentry SDK or want to supply your own reporter. Errors are silently swallowed by the built-in `NoopReporter` unless you register a custom one.

```typescript
import { Try, NoopReporter } from '@power-rent/try-catch';

// Default: errors are not reported anywhere
const value = await new Try(riskyFn, arg).value();

// Provide your own reporter
import { Try } from '@power-rent/try-catch';
import type { Reporter, ErrorReportConfig } from '@power-rent/try-catch';

class ConsoleReporter implements Reporter {
  report(error: Error, config: ErrorReportConfig): void {
    console.error(config.message ?? error.message, error);
  }
  addBreadcrumbs(data: Record<string, unknown>, functionName?: string): void {
    console.log('breadcrumbs', functionName, data);
  }
  createWrappedError(error: Error, message: string): Error {
    const wrapped = new Error(`${message}: ${error.message}`);
    wrapped.cause = error;
    return wrapped;
  }
}

Try.setDefaultReporter(new ConsoleReporter());
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

## Common Setup Issues

**Wrong entry point imported** — If errors are never sent to Sentry, ensure you imported a runtime-specific entry point (`/node`, `/browser`, or `/nextjs`) rather than the root `@power-rent/try-catch`. The root entry registers a `NoopReporter` by default.

**Sentry SDK not installed** — The library declares all Sentry packages as `devDependencies` and never bundles them. You must add the matching Sentry SDK to your project:

```bash
# Node.js
npm install @sentry/node

# Browser
npm install @sentry/browser

# Next.js
npm install @sentry/nextjs
```

Supported version range: `>=8.0.0 <11.0.0`.

**`await new Try(fn)` returns the `Try` instance** — This is expected behaviour for every wrapped function (sync or async). `Try` instances are not thenable, so `await` cannot trigger execution. Use `.value()`, `.unwrap()`, `.error()`, or `.result()` to retrieve the result.

## Next Steps

- See [ARCHITECTURE.md](./ARCHITECTURE.md) for an overview of how the library is structured internally, including the sync/async execution paths and the reporter integration model.
- The full API reference (constructor, configuration methods, terminal methods) is documented in the [API section of README.md](../README.md#api).
