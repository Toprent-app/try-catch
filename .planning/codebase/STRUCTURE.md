# Codebase Structure

**Analysis Date:** 2026-01-30

## Directory Layout

```
[project-root]/
├── .changeset/          # Changeset versioning
├── .claude/             # Claude AI config
├── .github/             # GitHub Actions
│   └── workflows/
├── .husky/              # Git hooks
│   └── _/
├── .planning/           # GSD planning docs
│   └── codebase/
├── .qoder/              # Quests?
│   └── quests/
├── CHANGELOG.md         # Release notes
├── dist/                # tsup builds (CJS/ESM)
│   ├── esm/
│   │   ├── browser/
│   │   ├── nextjs/
│   │   └── node/
│   ├── browser/
│   ├── nextjs/
│   └── node/
├── examples/            # Usage demos
├── node_modules/        # Dependencies
├── package.json         # Exports: ./browser|node|nextjs
├── README.md            # Docs
├── tsconfig.json        # TS config
├── tsup.config.ts       # Build config
├── vite.config.ts       # Vitest config
└── src/
    ├── __tests__/       # Unit tests
    ├── adapters/        # Reporter impls
    │   ├── browser/
    │   │   └── reporter.ts
    │   └── node/
    │       └── reporter.ts
    ├── browser/
    │   └── index.ts
    ├── core/            # Abstractions
    │   ├── Try.ts
    │   ├── reporter.ts
    │   └── index.ts
    ├── nextjs/
    │   ├── SentryReporter.ts
    │   └── index.ts
    ├── node/
    │   └── index.ts
    └── utils/           # Breadcrumb utils
        ├── breadcrumbs.ts
        ├── error-reporter.ts
        ├── index.ts
        ├── transformers.ts
        └── types.ts
```

## Directory Purposes

**src/core/:**
- Purpose: Core abstractions (Try class, Reporter interface)
- Contains: Class definitions, interfaces
- Key files: `src/core/Try.ts`, `src/core/reporter.ts`

**src/utils/:**
- Purpose: Pure functions for breadcrumbs/transformers
- Contains: Utility .ts
- Key files: `src/utils/breadcrumbs.ts`, `src/utils/types.ts`

**src/adapters/[platform]/:**
- Purpose: Concrete Reporters for Sentry SDKs
- Contains: reporter.ts
- Key files: `src/adapters/browser/reporter.ts`

**src/[platform]/:**
- Purpose: Barrel exports + default Reporter setup
- Contains: index.ts
- Key files: `src/browser/index.ts`

**src/__tests__/:**
- Purpose: Vitest unit tests
- Contains: *.test.ts

## Key File Locations

**Entry Points:**
- `src/index.ts`: Core no-op export
- `src/browser/index.ts`: Browser Sentry
- `src/node/index.ts`: Node Sentry
- `src/nextjs/index.ts`: Next.js Sentry

**Configuration:**
- `tsup.config.ts`: Multi-entry builds
- `package.json`: Subpath exports
- `vite.config.ts`: Test runner

**Core Logic:**
- `src/core/Try.ts`: Fluent execution/error handling

**Testing:**
- `src/__tests__/Try.test.ts`

## Naming Conventions

**Files:**
- PascalCase.ts: Classes (`Try.ts`, `SentryReporter.ts`)
- camelCase.ts: Utils/modules (`breadcrumbs.ts`, `index.ts`)

**Directories:**
- lowercase: All dirs (`src/core/`, `src/utils/`)

## Where to Add New Code

**New Feature:**
- Primary code: `src/core/` (abstraction) or `src/utils/`
- Tests: `src/__tests__/new.test.ts`

**New Component/Module:**
- Reporter: `src/adapters/new-env/reporter.ts`
- Entry: `src/new-env/index.ts` + package.json export

**Utilities:**
- Shared helpers: `src/utils/newUtil.ts`

## Special Directories

**dist/:**
- Purpose: Generated builds per format/env
- Generated: Yes (tsup)
- Committed: No (rm -rf in build)

**src/__tests__/:**
- Purpose: Tests (co-located with src)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-01-30*