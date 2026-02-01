# Stack Research

**Domain:** TypeScript error-handling library with Sentry adapters (node/browser/nextjs)
**Researched:** 2026-01-30
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.9.3 | Language + type system | Current stable TS for library authoring and type-safety guarantees. Confidence: HIGH (npm registry). |
| @sentry/node | 10.38.0 | Node adapter | Official Sentry SDK for Node adapters; keeps report() integration aligned with Sentry’s current APIs. Confidence: HIGH (npm registry). |
| @sentry/browser | 10.38.0 | Browser adapter | Official Sentry SDK for browser adapters; matches Node/NextJS major version. Confidence: HIGH (npm registry). |
| @sentry/nextjs | 10.38.0 | Next.js adapter | Official Sentry SDK for Next.js entrypoints. Confidence: HIGH (npm registry). |
| Rollup | 4.57.1 | Library bundling | Stable, widely used for library builds; supports multi-entry ESM/CJS outputs with mature plugin ecosystem. Confidence: HIGH (npm registry). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @rollup/plugin-typescript | 12.3.0 | TS → JS build pipeline | When bundling from TS directly in Rollup. Confidence: HIGH. |
| @rollup/plugin-node-resolve | 16.0.3 | Resolve deps | When building bundles that reference node_modules. Confidence: HIGH. |
| @rollup/plugin-commonjs | 29.0.0 | CJS interop | If any dependencies are CJS-only. Confidence: HIGH. |
| tslib | 2.8.1 | TS runtime helpers | When using `importHelpers` for smaller output. Confidence: HIGH. |
| Vitest | 4.0.18 | Test runner | For fast TS-native unit tests (requires Node ≥20). Confidence: HIGH. |
| tsd | 0.33.0 | Type tests | For validating exported types and conditional exports. Confidence: HIGH. |
| @changesets/cli | 2.29.8 | Versioning & changelogs | For controlled releases across adapters. Confidence: HIGH. |
| TypeDoc | 0.28.16 | API docs | When generating API reference from TypeScript. Confidence: HIGH. |
| publint | 0.3.17 | Package linting | For validating exports/types/entrypoints before publish. Confidence: HIGH. |
| @arethetypeswrong/cli | 0.18.2 | Type export validation | When verifying conditional exports and d.ts correctness. Confidence: HIGH. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint 9.39.2 | Linting | Use with flat config; pair with TypeScript ESLint. Confidence: HIGH. |
| @typescript-eslint/eslint-plugin 8.54.0 | TS lint rules | Required for type-aware linting. Confidence: HIGH. |
| @typescript-eslint/parser 8.54.0 | TS parser for ESLint | Required by ESLint TypeScript integration. Confidence: HIGH. |
| Prettier 3.8.1 | Formatting | Keep docs/tests/TS formatting consistent. Confidence: HIGH. |

## Installation

```bash
# Core
npm install @sentry/node@10.38.0 @sentry/browser@10.38.0 @sentry/nextjs@10.38.0

# Supporting
npm install tslib@2.8.1

# Dev dependencies
npm install -D typescript@5.9.3 rollup@4.57.1 @rollup/plugin-typescript@12.3.0 @rollup/plugin-node-resolve@16.0.3 @rollup/plugin-commonjs@29.0.0 vitest@4.0.18 tsd@0.33.0 @changesets/cli@2.29.8 typedoc@0.28.16 publint@0.3.17 @arethetypeswrong/cli@0.18.2 eslint@9.39.2 @typescript-eslint/eslint-plugin@8.54.0 @typescript-eslint/parser@8.54.0 prettier@3.8.1
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Rollup 4.57.1 | tsdown 0.20.1 | If you want faster builds and are OK with a newer, Node ≥20.19-only toolchain. |
| Vitest 4.0.18 | Jest 30.2.0 | If you must support Node 18 in CI and can accept slower test runs. |
| Changesets 2.29.8 | semantic-release 25.0.2 | If you want fully automated releases and already enforce Conventional Commits. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| tsup | Marked “not actively maintained” by maintainer. | Rollup 4.57.1 or tsdown 0.20.1. |

## Stack Patterns by Variant

**If CI/runtime must stay on Node 18:**
- Use Rollup + Jest (not Vitest)
- Because Vitest requires Node ≥20

**If you can standardize on Node ≥20.19:**
- Consider tsdown for builds
- Because it targets library bundling and is compatible with tsup-style configs

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @sentry/* 10.38.0 | Node >=18 | Sentry JS SDKs require Node 18+. |
| Vitest 4.0.18 | Node >=20 | Node engine constraint in package. |
| tsdown 0.20.1 | Node >=20.19 | Node engine constraint in package. |
| Rollup 4.57.1 | Node >=18 | Node engine constraint in package. |

## Sources

- https://registry.npmjs.org/typescript/latest — version 5.9.3
- https://registry.npmjs.org/@sentry/node/latest — version 10.38.0
- https://registry.npmjs.org/@sentry/browser/latest — version 10.38.0
- https://registry.npmjs.org/@sentry/nextjs/latest — version 10.38.0
- https://registry.npmjs.org/rollup/latest — version 4.57.1
- https://registry.npmjs.org/tsdown/latest — version 0.20.1
- https://registry.npmjs.org/vitest/latest — version 4.0.18
- https://registry.npmjs.org/jest/latest — version 30.2.0
- https://registry.npmjs.org/@changesets/cli/latest — version 2.29.8
- https://registry.npmjs.org/semantic-release/latest — version 25.0.2
- https://registry.npmjs.org/eslint/latest — version 9.39.2
- https://registry.npmjs.org/@typescript-eslint/eslint-plugin/latest — version 8.54.0
- https://registry.npmjs.org/@typescript-eslint/parser/latest — version 8.54.0
- https://registry.npmjs.org/prettier/latest — version 3.8.1
- https://registry.npmjs.org/tsd/latest — version 0.33.0
- https://registry.npmjs.org/typedoc/latest — version 0.28.16
- https://registry.npmjs.org/publint/latest — version 0.3.17
- https://registry.npmjs.org/@arethetypeswrong/cli/latest — version 0.18.2
- https://www.npmjs.com/package/tsup — maintenance warning (not actively maintained)

---
*Stack research for: TypeScript error-handling library with Sentry adapters*
*Researched: 2026-01-30*
