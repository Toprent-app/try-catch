# Architecture

**Analysis Date:** 2026-01-30

## Pattern Overview

**Overall:** Modular library with abstraction layers and platform adapters

**Key Characteristics:**
- Dependency inversion via Reporter interface
- Fluent configuration API
- Lazy single execution with result caching
- Multiple package exports for environments (browser, node, nextjs)

## Layers

**Core (`src/core/`):**
- Purpose: Fundamental Try class and reporting abstraction
- Location: `src/core/`
- Contains: Try.ts (main class), reporter.ts (interface/NoopReporter)
- Depends on: `src/utils/` for breadcrumbs/types
- Used by: Platform entrypoints and adapters

**Utils (`src/utils/`):**
- Purpose: Breadcrumb extraction, transformers, types
- Location: `src/utils/`
- Contains: types.ts, transformers.ts, breadcrumbs.ts, index.ts, error-reporter.ts
- Depends on: None (pure utilities)
- Used by: Core Try class

**Adapters (`src/adapters/`):**
- Purpose: Concrete platform-specific Reporter implementations
- Location: `src/adapters/browser/`, `src/adapters/node/`
- Contains: reporter.ts using Sentry SDKs
- Depends on: `src/core/reporter`, @sentry/*
- Used by: `src/browser/index.ts`, `src/node/index.ts`

**Platform Entry Points:**
- Purpose: Pre-configured exports for specific runtimes
- Location: `src/browser/`, `src/node/`, `src/nextjs/`
- Contains: index.ts re-exports Try + sets default Reporter
- Depends on: core/Try, adapters or SentryReporter
- Used by: Library consumers

## Data Flow

**Try Usage Flow:**

1. Import platform Try (sets default Reporter)
2. `new Try(fn, ...args)` - configures fluent chain
3. `.report(msg).tag(..).breadcrumbs(..).default(val)`
4. `.value()` / `.unwrap()` / `.error()` triggers `execute()`
5. `execute()`: `try { await fn() } catch(e) {}`, cache result
6. On error + report config: breadcrumbs -> Reporter.report()
7. Return value/default/undefined or throw wrapped error

**State Management:**
- `pending` / `executed` flags
- Cached `result`, `breadcrumbData`

## Key Abstractions

**Try&lt;T, TArgs&gt;:**
- Purpose: Generic fluent async error handler
- Examples: `src/core/Try.ts`
- Pattern: Builder pattern + Result-like (success/value|error)

**Reporter:**
- Purpose: Strategy for error reporting/breadcrumbs
- Examples: `src/core/reporter.ts` (interface), `src/adapters/browser/reporter.ts`, `src/nextjs/SentryReporter.ts`
- Pattern: Dependency injection via static defaultReporter

**BreadcrumbExtractorUtil:**
- Purpose: Flexible arg-to-context extraction
- Examples: `src/utils/breadcrumbs.ts`
- Pattern: Visitor/multi-dispatch on config types

## Entry Points

**Core Library (`src/index.ts`):**
- Location: `src/index.ts`
- Triggers: `import Try from '@power-rent/try-catch'`
- Responsibilities: Export core + utils, NoopReporter default

**Browser (`src/browser/index.ts`):**
- Location: `src/browser/index.ts`
- Triggers: `import Try from '@power-rent/try-catch/browser'`
- Responsibilities: Set BrowserReporter default

**Node (`src/node/index.ts`):**
- Location: `src/node/index.ts`
- Triggers: `import Try from '@power-rent/try-catch/node'`
- Responsibilities: Set NodeReporter default

**Next.js (`src/nextjs/index.ts`):**
- Location: `src/nextjs/index.ts`
- Triggers: `import Try from '@power-rent/try-catch/nextjs'`
- Responsibilities: Extend Try, set SentryReporter default

## Error Handling

**Strategy:** Internal try-catch, conditional report/wrap/throw/return via Reporter

**Patterns:**
- Opt-in `.report()` triggers Sentry.captureException + breadcrumbs
- Error wrapping: new Error(msg, {cause: original})
- Ignore types: static throwThroughErrorTypes()
- Safe defaults: .default(val).value() never throws

## Cross-Cutting Concerns

**Logging:** Opt-in .debug() -> console.error(error)
**Validation:** TS generics on T/TArgs, exhaustive types
**Authentication:** N/A (utility library)

---

*Architecture analysis: 2026-01-30*