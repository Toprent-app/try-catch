# Coding Conventions

**Analysis Date:** 2026-01-30

## Naming Patterns

**Files:**
- PascalCase for primary classes: \`src/core/Try.ts\`
- camelCase for utilities and indexes: \`src/utils/index.ts\`, \`src/core/index.ts\`

**Functions:**
- camelCase consistently: \`execute()\`, \`unwrap()\`, \`throwingFunction()\` in \`src/core/Try.ts\`, \`src/__tests__/Try.test.ts\`

**Variables:**
- camelCase: \`defaultVal\`, \`params\`, \`result\`, \`config\` throughout source files like \`src/core/Try.ts\`

**Types:**
- PascalCase interfaces and types: \`TryResult&lt;T&gt;\`, \`TryConfig&lt;TArgs&gt;\`, \`ErrorReportConfig\` in \`src/core/Try.ts\`, \`src/core/reporter.ts\`

## Code Style

**Formatting:**
- Prettier enforced via \`npm run format\`
- Key settings in \`.prettierrc\`: singleQuote: true, jsxSingleQuote: true, endOfLine: \"lf\"

**Linting:**
- Not detected (no .eslintrc* or eslint.config.* files)

## Import Organization

**Order:**
1. Vitest globals: \`import { describe, it, expect, vi } from 'vitest';\` in \`src/__tests__/Try.test.ts\`
2. External libs: \`import * as Sentry from '@sentry/nextjs';\`
3. Local modules: \`import { Try } from './Try';\`, \`import type { BreadcrumbTransformer } from './types';\`

**Path Aliases:**
- Not detected

Use relative paths: \`../nextjs\`, \`./reporter\`

## Error Handling

**Patterns:**
- try-catch-finally in async methods: \`src/core/Try.ts: execute()\`
- Discriminated unions: \`TryResult&lt;T&gt; = { success: true, value: T } | { success: false, error: Error }\`
- Wrapped errors: \`new Error(message, { cause: originalError })\` in \`src/core/reporter.ts\`
- Ignore specific types: \`Try.throwThroughErrorTypes(['GraphQLError'])\`

## Logging

**Framework:** console

**Patterns:**
- Conditional debug logging: \`if (this.config.debug) console.error(e);\` in \`src/core/Try.ts\`
- Finally callback errors: \`console.error('Error in finally callback', err)\`

## Comments

**When to Comment:**
- Public APIs, complex type logic, usage examples

**JSDoc/TSDoc:**
- Extensive with @example code blocks: 
```typescript
/** 
 * @example
 * const result = new Try(fn, arg);
 */
```
Seen in \`src/core/Try.ts\`

## Function Design

**Size:** Methods 10-50 lines, complex overloads longer

**Parameters:** Variadic typed: \`(...args: TArgs) => Promise&lt;T&gt;\`

**Return Values:** Promises with discriminated unions or chainable \`this\`

## Module Design

**Exports:** Named exports for classes/types, re-exports in barrels

**Barrel Files:** \`src/index.ts\`, \`src/core/index.ts\` re-export core: \`export { Try } from './Try';\`

---

*Convention analysis: 2026-01-30*