---
phase: 3
plan: "03-03"
subsystem: examples
tags: [dx, examples, typecheck, reporter]
dependency_graph:
  requires:
    - src/core/Try.ts
    - src/core/reporter.ts
    - src/{index,node/index,browser/index,nextjs/index}.ts
  provides:
    - examples/tsconfig.json
    - examples/custom-reporter.ts
    - examples/comprehensive-examples.ts
    - examples/README.md
  affects: []
tech_stack:
  added: []
  patterns:
    - tsconfig paths mapping package name to local src/
    - Reporter interface with three methods (report, addBreadcrumbs, createWrappedError)
key_files:
  created:
    - examples/tsconfig.json
  modified:
    - examples/custom-reporter.ts
    - examples/comprehensive-examples.ts
    - examples/README.md
decisions:
  - D-07 surfaced as non-Error normalization demo (string/object throws)
  - D-08 surfaced as breadcrumbs-on-every-terminal demo across .value/.unwrap/.error/.result
  - D-09 intentionally not shown — no mention of Next.js double-add fix
  - D-11 every example pattern validated against current src/ API
  - D-12 every example imports from @power-rent/try-catch[/sub], never ../src/
  - No TS runner pinned as dev-dep → README documents `npm install -D tsx` one-liner rather than inventing a command
metrics:
  duration: ~6m
  completed: 2026-04-18
---

# Phase 3 Plan 03-03: Examples Modernization Summary

**One-liner:** Trimmed `examples/` from 977 → 370 lines, moved to package-path imports, added dedicated tsconfig with `paths` resolution, rewrote custom-reporter against the current three-method `Reporter` interface.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | examples/tsconfig.json + rewrite custom-reporter.ts | 20dd789 |
| 2 | Rewrite comprehensive-examples.ts as modern API tour | e64b073 |
| 3 | Rewrite examples/README.md + strip D-09 header mention | 281b51f |

## Deliverables

### `examples/tsconfig.json` (new)

- `extends: "../tsconfig.json"` — inherits strict mode and target.
- `compilerOptions`: `noEmit: true`, `moduleResolution: "node"`, `baseUrl: "."`.
- `paths`:
  - `"@power-rent/try-catch"` → `["../src/index.ts"]`
  - `"@power-rent/try-catch/*"` → `["../src/*/index.ts"]`
- `include: ["./*.ts"]`, `exclude: ["../node_modules"]`.

### `examples/custom-reporter.ts` (rewritten)

- ~60 lines, single `ConsoleReporter implements Reporter` covering all three methods.
- Imports `Try`, `NoopReporter`, `type Reporter`, `type ErrorReportConfig` from `@power-rent/try-catch`.
- Demonstrates the `NoopReporter` baseline + `Try.setDefaultReporter(new ConsoleReporter())` registration.

### `examples/comprehensive-examples.ts` (rewritten)

- **977 → 370 lines.**
- Labeled sections: Sync basics → Async basics → Fallback with `.default()` → Reporting + tags → Breadcrumbs variants → Breadcrumbs on every terminal (D-08) → Non-Error normalization (D-07) → finally + debug → Reporter interface recap → Entry-point selection (type-only).
- Exercises every method on `Try`: `.value`, `.unwrap`, `.error`, `.result`, `.default`, `.finally`, `.debug`, `.report`, `.breadcrumbs` (four variants), `.tag`, `.tags`, plus statics `Try.setDefaultReporter`, `Try.throwThroughErrorTypes`.
- Registers `NoopReporter` at the top so running the file produces no side effects.
- Entry-point classes imported as types only, so the file is runnable under any environment.

### `examples/README.md` (rewritten)

- Per-file summary for both `.ts` files.
- Run instructions: `npm install -D tsx` + `npx tsx examples/<file>.ts` (no runner was pinned as a dev-dep).
- Dedicated "Type-checking these examples" subsection pointing at `npx tsc -p examples`.
- Notes package-path import resolution via `paths` during development (D-12).
- Cross-links to `../README.md` and `../docs/GETTING-STARTED.md`.

## Patterns dropped from the old comprehensive-examples.ts

- `../src/core` and `../src/{node,browser,nextjs}` relative imports (D-12 violation).
- A `BreadcrumbExtractor`-shaped entry with `keys: string[]` that referenced fields by string name against a parameter whose type did not satisfy the current `ValidateKeys` constraint — replaced with the narrower forms supported by the current API.
- `{ param: N, transform: (h) => ... }` examples where the transformer argument type did not match the actual parameter type — all transformers are now correctly typed against the parameter.
- Pre-Phase-1 `.default()` flows that implied defaults affected `.unwrap()`.
- Real-world service/repository/API-client fan-out (UserService, ApiClient) whose breadcrumb extractors no longer typecheck against the current generics — the tour focuses on first-principles patterns; larger app-layer patterns belong in docs/GETTING-STARTED.md.
- "Platform-Specific Examples" sections that imported from three runtimes simultaneously — replaced with a single type-only entry-points section to avoid loading both browser and node adapters in one file.
- Testing-patterns section that defined a custom `TestReporter` — that pattern is now owned by `examples/custom-reporter.ts`, which is the authoritative Reporter-implementation example.
- Old `console.log`-driven "Example Output" copy in the README; replaced with concise file summaries.

## Run command chosen

```bash
npm install -D tsx
npx tsx examples/comprehensive-examples.ts
npx tsx examples/custom-reporter.ts
```

`tsx` is the lowest-friction option for this repo because:
- No `ts-node` config file is required.
- It handles ESM `import` from `.ts` without additional flags.
- The `examples/tsconfig.json` `paths` mapping resolves under `tsx`'s loader for the package name.

## Verification results

- `npx tsc -p examples` — **0 errors**.
- `npx tsc --noEmit` (root) — **0 errors** (unchanged include scope, `src/**/*` only).
- `npm test` — **234/234 passing** across 9 test files.
- `grep -F "../src/" examples/*.ts` — matches only inside tsconfig `paths` and a negative-documentation comment; zero real imports.
- `grep -F "implements Reporter" examples/custom-reporter.ts` — exactly 1 match.
- `grep -Ei "double-add" examples/` — **0 matches** (D-09 fully scrubbed).

## Deviations from plan

None. All three tasks executed as written. A final micro-edit removed a self-documenting "D-09 not shown" line from the `comprehensive-examples.ts` header to satisfy the strict "No mention of the Next.js double-add fix anywhere in `examples/`" verification gate.

## Follow-ups

- Consider adding `tsx` as a dev-dependency so the README can recommend `npx tsx examples/...` without an install step. Currently the README documents the install as a one-liner to avoid inventing a command that fails.
- If the examples tour grows further, split entry-point selection into a fourth file (`entry-points.ts`) rather than keeping it as a type-only section.

## Self-Check: PASSED

- `examples/tsconfig.json` — FOUND
- `examples/custom-reporter.ts` — FOUND (61 lines)
- `examples/comprehensive-examples.ts` — FOUND (370 lines)
- `examples/README.md` — FOUND
- Commit 20dd789 — FOUND
- Commit e64b073 — FOUND
- Commit 281b51f — FOUND
