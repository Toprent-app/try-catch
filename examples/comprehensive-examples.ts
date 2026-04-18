/**
 * Comprehensive Examples — tour of the current `@power-rent/try-catch` API.
 *
 * This file is type-checked via `npx tsc -p examples` and demonstrates every
 * method currently on the `Try` class plus key reporter-related patterns.
 *
 * All imports use published package paths (D-12) and every pattern shown
 * matches the current `src/` behavior (D-11). The synthetic fixtures below
 * (e.g. `fetchUser`) never perform real I/O.
 *
 * Behaviors referenced in this file:
 *   - D-07: non-Error throws are normalized to `Error` with
 *           `message === "Non-Error thrown (<typeof>)"` and `cause === original`.
 *   - D-08: breadcrumbs record on every terminal method
 *           (.value / .unwrap / .error / .result) — not only on .unwrap.
 *   - D-09: the Next.js double-add fix is an internal detail and is NOT shown.
 *   - D-11: every pattern matches the current API surface.
 *   - D-12: imports come from the package name, never from `../src/...`.
 *
 * Swap `NoopReporter` for `ConsoleReporter` (see ./custom-reporter.ts) to see
 * reports printed to stdout; in production swap for a real Sentry/etc. reporter.
 */
import {
  Try,
  NoopReporter,
  type TryResult,
  type Reporter,
  type ErrorReportConfig,
} from '@power-rent/try-catch';

// Runtime-specific entry points are importable the same way. The selection of
// the right entry point is a build-time/config-time concern — see
// docs/GETTING-STARTED.md. These imports are type-only here to keep the file
// runnable under any environment.
import type { Try as NodeTry } from '@power-rent/try-catch/node';
import type { Try as BrowserTry } from '@power-rent/try-catch/browser';
import type { Try as NextjsTry } from '@power-rent/try-catch/nextjs';

// Register the library default: produce no reports when this file runs.
Try.setDefaultReporter(new NoopReporter());

// === Section: Synthetic fixtures ===
// Realistic-looking but fully local functions used across the examples.

interface User {
  id: number;
  email: string;
  name: string;
}

async function fetchUser(id: number): Promise<User> {
  if (id <= 0) {
    throw new Error(`invalid user id: ${id}`);
  }
  return { id, email: `user${id}@example.com`, name: `User ${id}` };
}

function parseIntStrict(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n)) {
    throw new Error(`not a number: ${input}`);
  }
  return n;
}

async function updateUser(
  input: { userId: number; email: string },
  options: { dryRun: boolean },
): Promise<User> {
  if (!options.dryRun && input.userId < 0) {
    throw new Error('cannot persist negative user id');
  }
  return { id: input.userId, email: input.email, name: `User ${input.userId}` };
}

async function flaky(): Promise<number> {
  throw new Error('flaky failure');
}

// === Section: Sync basics ===

export function syncBasics(): void {
  // .value() returns T | undefined (or the configured default) and never throws.
  const n1 = new Try(parseIntStrict, '42').value();
  console.log('syncBasics value', n1); // 42

  // .unwrap() throws on error, returns T on success.
  const n2 = new Try(parseIntStrict, '7').unwrap();
  console.log('syncBasics unwrap', n2); // 7

  // .error() returns Error | undefined.
  const err = new Try(parseIntStrict, 'not-a-number').error();
  console.log('syncBasics error', err?.message); // "not a number: not-a-number"

  // .result() returns a discriminated union — exhaustive pattern match.
  const r: TryResult<number> = new Try(parseIntStrict, '99').result();
  if (r.success) {
    console.log('syncBasics result.value', r.value);
  } else {
    console.log('syncBasics result.error', r.error.message);
  }
}

// === Section: Async basics ===

export async function asyncBasics(): Promise<void> {
  // For async functions, terminal methods return Promises.
  const u1 = await new Try(fetchUser, 1).value(); // User | undefined
  console.log('asyncBasics value', u1?.email);

  const u2 = await new Try(fetchUser, 2).unwrap(); // throws on failure
  console.log('asyncBasics unwrap', u2.email);

  const err = await new Try(fetchUser, -1).error(); // Error | undefined
  console.log('asyncBasics error', err?.message);

  const r = await new Try(fetchUser, 3).result(); // TryResult<User>
  console.log('asyncBasics result.success', r.success);

  // `await new Try(asyncFn, ...)` is shorthand for `.value()`.
  const u3 = await new Try(fetchUser, 4);
  console.log('asyncBasics await shorthand', u3?.email);
}

// === Section: Fallback with .default() ===

export async function fallbackWithDefault(): Promise<void> {
  // .default() supplies the value used when the wrapped function fails.
  const users = await new Try(fetchUser, -1).default({
    id: 0,
    email: 'anon@example.com',
    name: 'Anonymous',
  } satisfies User).value();
  console.log('fallbackWithDefault value', users.email); // "anon@example.com"

  // .default() only affects .value() — .unwrap() still throws.
  const err = await new Try(fetchUser, -5)
    .default({
      id: 0,
      email: 'anon@example.com',
      name: 'Anonymous',
    } satisfies User)
    .error();
  console.log('fallbackWithDefault error still surfaces', err?.message);
}

// === Section: Reporting + tags ===

export async function reportingAndTags(): Promise<void> {
  // .report() attaches a message used by the reporter on failure.
  await new Try(flaky)
    .report('flaky-op failed')
    .tag('component', 'billing')
    .tag('severity', 'high')
    .value();

  // .tags() sets multiple tags in one call.
  await new Try(flaky)
    .report('flaky-op failed')
    .tags({ component: 'billing', operation: 'charge', gateway: 'stripe' })
    .value();

  // `.unwrap()` with `.report()` wraps the original error with the given message.
  try {
    await new Try(flaky).report('billing op failed').unwrap();
  } catch (e) {
    const err = e as Error;
    console.log('reporting wrapped message', err.message); // "billing op failed"
    console.log('reporting original cause', (err.cause as Error)?.message);
  }

  // `Try.throwThroughErrorTypes` skips the wrap-step for listed error names.
  class ValidationError extends Error {
    override name = 'ValidationError';
  }
  Try.throwThroughErrorTypes(['ValidationError']);
  try {
    await new Try(async () => {
      throw new ValidationError('bad input');
    })
      .report('this message is ignored for ValidationError')
      .unwrap();
  } catch (e) {
    console.log('throwThrough', (e as Error).name); // "ValidationError"
  }
  Try.throwThroughErrorTypes([]); // reset
}

// === Section: Breadcrumbs variants ===

export async function breadcrumbsVariants(): Promise<void> {
  // 1) Keys from the first object parameter.
  await new Try(updateUser, { userId: 1, email: 'a@b.com' }, { dryRun: true })
    .breadcrumbs(['userId', 'email'])
    .report('updateUser failed (keys)')
    .value();

  // 2) Variadic transformer functions — one per positional argument.
  await new Try(updateUser, { userId: 2, email: 'c@d.com' }, { dryRun: false })
    .breadcrumbs(
      (input) => ({ userId: input.userId, emailLen: input.email.length }),
      (opts) => ({ dryRun: opts.dryRun }),
    )
    .report('updateUser failed (transformers)')
    .value();

  // 3) Object syntax — parameter index as keys.
  await new Try(updateUser, { userId: 3, email: 'e@f.com' }, { dryRun: true })
    .breadcrumbs({
      0: ['userId'],
      1: (opts) => ({ dryRun: opts.dryRun }),
    })
    .report('updateUser failed (object-syntax)')
    .value();

  // 4) Extractor objects — advanced positional control.
  await new Try(updateUser, { userId: 4, email: 'g@h.com' }, { dryRun: false })
    .breadcrumbs([
      { param: 0, keys: ['userId', 'email'] },
      {
        param: 1,
        transform: (opts: { dryRun: boolean }) => ({
          mode: opts.dryRun ? 'dry' : 'live',
        }),
      },
    ])
    .report('updateUser failed (extractors)')
    .value();
}

// === Section: Breadcrumbs record on every terminal method (D-08) ===

export async function breadcrumbsOnEveryTerminal(): Promise<void> {
  // .value()
  await new Try(fetchUser, -1)
    .breadcrumbs((id) => ({ id }))
    .value();

  // .unwrap() — catches to keep example runnable
  try {
    await new Try(fetchUser, -1)
      .breadcrumbs((id) => ({ id }))
      .unwrap();
  } catch {
    /* breadcrumbs were recorded before the throw */
  }

  // .error()
  await new Try(fetchUser, -1)
    .breadcrumbs((id) => ({ id }))
    .error();

  // .result()
  await new Try(fetchUser, -1)
    .breadcrumbs((id) => ({ id }))
    .result();
}

// === Section: Non-Error normalization (D-07) ===

export async function nonErrorThrows(): Promise<void> {
  // Throwing a string is normalized to an `Error` with:
  //   - message === "Non-Error thrown (string)"
  //   - cause   === "boom"
  const r = await new Try(async () => {
    throw 'boom';
  }).result();

  if (!r.success) {
    console.log('nonError message', r.error.message); // "Non-Error thrown (string)"
    console.log('nonError cause', r.error.cause); // "boom"
  }

  // Same contract for objects, numbers, null, undefined.
  const r2 = new Try(() => {
    throw { code: 500 };
  }).result();
  if (!r2.success) {
    console.log('nonError object', r2.error.message); // "Non-Error thrown (object)"
  }
}

// === Section: finally + debug ===

export async function finallyAndDebug(): Promise<void> {
  let ran = false;

  // .finally() runs once after the wrapped function settles (success or failure),
  // before the error is re-thrown by .unwrap().
  await new Try(fetchUser, 5)
    .finally(() => {
      ran = true;
    })
    .value();
  console.log('finallyAndDebug finally-ran', ran);

  // .debug() opts in to console.error on failure — libraries should not log
  // by default, so this is explicit and reversible.
  await new Try(fetchUser, -1).debug().value();
  await new Try(fetchUser, -1).debug(false).value();
  await new Try(fetchUser, -1)
    .debug(process.env.NODE_ENV === 'development')
    .value();
}

// === Section: Reporter interface recap ===
// See ./custom-reporter.ts for the canonical minimal implementation.
// Here we show the shape used to type a reporter parameter.

export function reporterInterfaceRecap(): void {
  // A Reporter must implement all three methods:
  const myReporter: Reporter = {
    report(_error: Error, _config: ErrorReportConfig): void {
      /* forward to your backend */
    },
    addBreadcrumbs(
      _data: Record<string, unknown>,
      _functionName?: string,
    ): void {
      /* attach context */
    },
    createWrappedError(error: Error, message: string): Error {
      const wrapped = new Error(message);
      wrapped.cause = error;
      wrapped.stack = error.stack;
      return wrapped;
    },
  };
  // Register at app startup to change what all Try instances report to.
  Try.setDefaultReporter(myReporter);
  // Reset back to the no-op for the rest of this file.
  Try.setDefaultReporter(new NoopReporter());
}

// === Section: Entry-point selection (type-only) ===
// Pick the entry point that matches your runtime; see docs/GETTING-STARTED.md.
//
//   import { Try } from '@power-rent/try-catch';         // framework-agnostic, NoopReporter default
//   import { Try } from '@power-rent/try-catch/node';    // NodeReporter default
//   import { Try } from '@power-rent/try-catch/browser'; // BrowserReporter default
//   import { Try } from '@power-rent/try-catch/nextjs';  // SentryReporter default
//
// The four classes share the same public surface, so code written against the
// core `Try` continues to work if you switch entry points.

export type EntryPointClasses = {
  node: typeof NodeTry;
  browser: typeof BrowserTry;
  nextjs: typeof NextjsTry;
};

// === Section: Runner ===
// Calling this function drives the whole tour; executing the file directly
// (via e.g. `tsx`) will run it. Type-checking alone does not invoke it.

export async function runAll(): Promise<void> {
  syncBasics();
  await asyncBasics();
  await fallbackWithDefault();
  await reportingAndTags();
  await breadcrumbsVariants();
  await breadcrumbsOnEveryTerminal();
  await nonErrorThrows();
  await finallyAndDebug();
  reporterInterfaceRecap();
}

// Execute when run directly. Commented out by default so importing this module
// in a test context does not cause side effects. Uncomment to run:
// void runAll();
