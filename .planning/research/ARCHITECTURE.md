# Architecture Research

**Domain:** TypeScript Try/Result error-handling library with optional Sentry reporting
**Researched:** 2026-01-30
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                 Public API / Entry Points                    │
├──────────────────────────────────────────────────────────────┤
│  try()/TryAsync | ok/err | helpers | report() | match/unwrap  │
│  node entry     | browser entry | nextjs entry               │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                ▼                               ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│        Core Result/Try         │   │     Reporter Interface    │
│  Result/ResultAsync,           │   │  report(err, ctx), hooks  │
│  combinators, typing            │   │  adapter registry          │
└───────────────┬────────────────┘   └──────────────┬───────────┘
                │                                   │
                ▼                                   ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│  Error Normalization & Context │   │     Sentry Adapter(s)     │
│  Error mapping, tags,          │   │  captureException, scopes │
│  metadata shaping              │   │  env-specific init         │
└───────────────────────────────┘   └──────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Public API | Fluent Try/Result surface for sync/async flows | Exported functions/classes; chainable methods and helpers (e.g., `ResultAsync`) inspired by neverthrow style APIs | 
| Core Result/Try | Type-safe success/err encapsulation and combinators | `Result<T,E>`, `ResultAsync<T,E>`, `map`, `mapErr`, `andThen`, `match`, `fromThrowable` | 
| Error Normalization | Convert `unknown` to typed error, enrich metadata | Error mapping utilities; `fromThrowable`/`fromPromise` patterns | 
| Reporter Interface | Abstraction for side-effect reporting | `reporter` interface; composable hooks; no hard Sentry dependency | 
| Sentry Adapter(s) | Bridge to Sentry SDKs in node/browser/nextjs | `@sentry/*` captureException + scope enrichment; env-specific setup files | 
| Entry Points (node/browser/nextjs) | Platform-specific exports and wiring | Separate entry files; tree-shakable imports; minimal polyfills | 

## Recommended Project Structure

```
src/
├── core/                 # Result/Try primitives, combinators
│   ├── result.ts          # Result<T,E>, ok/err, match/unwrap
│   ├── result-async.ts    # ResultAsync, fromPromise/fromThrowable
│   └── try.ts             # Try/TryAsync fluent wrappers
├── errors/               # Error normalization + typing utilities
│   ├── normalize.ts       # unknown -> Error/E
│   └── context.ts         # metadata shaping
├── reporting/            # Adapter boundary
│   ├── reporter.ts        # interface + no-op default
│   └── report.ts          # report() implementation
├── adapters/             # Optional integrations
│   └── sentry/            # Sentry adapter(s)
│       ├── browser.ts     # @sentry/browser
│       ├── node.ts        # @sentry/node
│       └── nextjs.ts      # @sentry/nextjs
├── entrypoints/           # platform exports
│   ├── browser.ts
│   ├── node.ts
│   └── nextjs.ts
└── index.ts               # shared exports
```

### Structure Rationale

- **core/**: Stable, dependency-free primitives; must be platform-agnostic.
- **reporting/**: Keeps side effects optional and composable; enables no-op by default.
- **adapters/sentry/**: Isolates Sentry SDK dependency and environment-specific init.
- **entrypoints/**: Avoids bundling Sentry into all targets; aligns with node/browser/nextjs exports.

## Architectural Patterns

### Pattern 1: Result/ResultAsync Chain (Railway-Oriented)

**What:** Provide `Result<T,E>` and `ResultAsync<T,E>` with combinators to avoid throwing.
**When to use:** All library APIs; async errors via `fromPromise`/`fromThrowable`.
**Trade-offs:** More explicit error handling; slightly more verbose than try/catch.

**Example:**
```typescript
const res = ResultAsync.fromPromise(fetchUser(), mapUnknown)
  .map(user => user.name)
  .mapErr(err => ({ ...err, source: "fetchUser" }))
  .match(ok => ok, err => report(err));
```

### Pattern 2: Side-Effect Tee for Reporting

**What:** Provide `report()` or `orTee`/`andTee`-style hooks to report without changing flow.
**When to use:** Observability hooks that must not alter success/failure path.
**Trade-offs:** Easier adoption; requires clear separation of data shaping vs reporting.

**Example:**
```typescript
tryAsync(fn)
  .orTee(err => report(err, { tag: "service" }))
  .match(handleOk, handleErr);
```

### Pattern 3: Adapter Boundary with Environment Entry Points

**What:** Keep adapters in isolated modules and expose platform entry points.
**When to use:** Any optional integration (Sentry, logging, metrics).
**Trade-offs:** More files/exports; best for tree-shaking and avoiding hard deps.

## Data Flow

### Error Capture Flow

```
User code
  ↓
Try/TryAsync wrapper
  ↓ (error)
Error normalization → metadata shaping
  ↓
report() → reporter interface
  ↓
Sentry adapter → Sentry.captureException + scopes
  ↓
Sentry SDK transport
```

### Context Enrichment Flow

```
Try result
  ↓
report(err, ctx)
  ↓
Sentry.withScope(scope => set tags/user/extras)
  ↓
captureException(err)
```

### Key Data Flows

1. **Sync try():** thrown/unknown → normalized error → `Result<T,E>` → optional report.
2. **Async tryAsync():** promise rejection/throw → `ResultAsync<T,E>` → optional report.
3. **Reporting:** error + context → scope enrichment → Sentry SDK capture.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single package with optional adapter; no batching needed. |
| 1k-100k users | Add configurable sampling/filters and context trimming. |
| 100k+ users | Emphasize reporting throttling, size limits, and adapter pluggability. |

### Scaling Priorities

1. **First bottleneck:** Event volume (Sentry quotas) → add sampling and dedupe.
2. **Second bottleneck:** Payload size → restrict context fields and stack traces.

## Anti-Patterns

### Anti-Pattern 1: Hard Sentry Dependency in Core

**What people do:** Import Sentry in core Result/Try files.
**Why it's wrong:** Forces Sentry into all bundles; breaks “optional” design.
**Do this instead:** Keep a reporter interface; Sentry adapter in separate entry point.

### Anti-Pattern 2: Implicit Reporting on Every Error

**What people do:** Auto-report all `Err` results by default.
**Why it's wrong:** Noisy, violates user expectations, increases costs.
**Do this instead:** Make `report()` explicit; allow opt-in hooks.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Sentry JS SDK | init early, captureException with scope enrichment | Sentry recommends initializing early; scope data is attached via `withScope` and tags | 

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Core ↔ Reporting | API interface (function or object) | no hard deps in core | 
| Reporting ↔ Adapter | Adapter registry or injection | enables per-env adapters | 

## Suggested Build Order (for subsequent improvements)

1. **Stabilize core Try/Result API** (no behavior changes to error semantics).
2. **Finalize error normalization contracts** (typed error shape, context schema).
3. **Introduce/extend reporter interface** (no-op default + pluggable adapter).
4. **Implement Sentry adapter(s)** (node/browser/nextjs entry points).
5. **Add scope/context helpers** (tags/user/extras mapping).
6. **Refine reporting ergonomics** (report()/orTee utilities, sampling).

## Sources

- https://github.com/supermacro/neverthrow (Result/ResultAsync APIs and combinators)
- https://github.com/supermacro/neverthrow/wiki/Working-with-ResultAsync (async Result usage patterns)
- https://docs.sentry.io/platforms/javascript/ (JS SDK initialization and capture)
- https://docs.sentry.io/platforms/javascript/guides/node/ (Node SDK init requirements)
- https://docs.sentry.io/platforms/javascript/guides/nextjs/ (Next.js multi-runtime init)
- https://docs.sentry.io/platforms/javascript/enriching-events/scopes/ (scope & context enrichment)

---
*Architecture research for: TypeScript error-handling library with optional Sentry reporting*
*Researched: 2026-01-30*
