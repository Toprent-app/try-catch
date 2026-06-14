---
subject: DX + lib-size analysis of @power-rent/try-catch
reviewers: [codex]
reviewers_failed: [grok]
reviewed_at: 2026-06-14T01:55:00Z
reviewed_artifact: ad-hoc engineering analysis (not a phase plan)
---

# Cross-AI Review — DX + Size Analysis

Two reviewers requested (`--codex --grok`). Codex completed; **Grok failed** (CLI
`AuthorizationRequired` / transport-channel errors across 4 varied attempts — the
xAI session needs interactive re-auth, not a prompt fix). Run `grok` once
interactively to re-authenticate, then re-issue `--grok` to add its review.

---

## Codex Review (model: default, gpt-5-class; ran read-only in repo)

**Verdict.** Analysis is broadly sound on package bloat, missing Sentry peer metadata,
bad ESM extensions, and README mutability lies. Biggest weakness: it over-focuses on
size/build cleanup while missing higher-risk *runtime semantics*.

**Errors / overstatements (verified against source):**
- `await new Try(...).report(...)` does **not** mean "no report." `then()` (Try.ts:846)
  delegates to `.value()`, which **does** report when `config.message` is set (Try.ts:639).
  Real issue: `await` is an implicit `.value()` terminal that *swallows the error*
  (returns undefined) — not "no report." Reframe accordingly.
- README reuse example is genuinely wrong — `const attempt = await new Try(...)` consumes
  the thenable; `attempt.value()` is invalid (README.md:44). ✓ agrees.
- "Optional peer deps fix MODULE_NOT_FOUND" is **overstated**. Optional peers add
  version/metadata checks but still allow `/node` to be imported without `@sentry/node`
  → runtime failure remains. Imports are top-level (adapters/node/reporter.ts:1).
- ".report() no-op with .error()/.result()" is too broad — because config mutates the
  *same* instance, a `.report()` can still affect a *later* `.value()`/`.unwrap()` on
  that instance. `.result()` non-reporting is intentional + tested (Try.test.ts:722).
- Minify matters for npm artifact size, **less** for consumer runtime (bundlers re-minify).
  Removing published sourcemaps is the bigger win; `.d.ts removeComments` is low value
  and hurts IntelliSense — don't call it a quick win.

**Omissions (issues the analysis missed):**
1. **Stale `dist`.** `dist/index.js` exposes async-only methods while `src` has
   sync-aware terminals (Try.ts:454); the d.ts is also stale. (Verified locally: dist
   built Feb 1, src changed Apr 15. dist is **gitignored**, so consumers are safe via
   `prepublishOnly` rebuild — but the analysis's size numbers were measured on a stale
   build; rebuild before trusting absolute KB.)
2. **Next.js double breadcrumbs.** `Try.reportError()` adds breadcrumbs (Try.ts:767),
   then `SentryReporter.report()` adds them **again** (nextjs/SentryReporter.ts:12-19).
   Node/browser adapters don't → behavior differs by adapter. **Confirmed bug.**
3. **Global mutable reporter state.** `Try.defaultReporter` is static (Try.ts:85);
   `/node` `/browser` `/nextjs` mutate it at import (node/index.ts:6). Import order
   changes behavior process-wide.
4. **In-flight config mutation race.** `setConfig()` mutates `this` (Try.ts:172) while
   async `.value()` reads `this.config` only after settlement (Try.ts:633). A late
   `.report()`/`.finally()` can affect an already-started execution.
5. **Non-`Error` throws typed wrong.** `TryResult` promises `Error` (Try.ts:43) but catch
   casts `e as Error` (Try.ts:709). `throw 'string'`/object breaks the public type contract.
6. **PII/security under-discussed.** Breadcrumb extraction copies raw selected values
   (breadcrumbs.ts:74); the `value` transformer records raw input (transformers.ts:34).
   Needs a redaction/warning story for a Sentry-reporting lib.

**Priority disagreements:**
- Publish-artifact correctness (stale dist, exports, peers, LICENSE, publishConfig) **above** minification.
- Global reporter state + nextjs duplicate breadcrumbs **above** internal simplification.
- `.d.ts removeComments` is **not** a quick win.
- Treat `await` as a v2 API issue but phrase as "implicit `.value()` terminal," not "no report."
- Don't prioritize `tryCatch()` alias early absent user demand.

**Net assessment (what Codex would do first):**
1. Publish correctness: stop relying on stale dist / regenerate; optional Sentry peers + install
   docs; `publishConfig.access:public`; add `LICENSE`; fix `.mjs/.cjs` exports.
2. Behavior traps: nextjs duplicate breadcrumbs, global reporter mutation, in-flight config
   races, non-`Error` throw handling.
3. README fixes (await/reuse/`.report().error()`/mutability). Size cleanup alongside, not above, correctness.

---

## Grok Review

Initially blocked on `Auth(AuthorizationRequired)`; completed after interactive
`grok login`. Grok reviewed the **implemented PR #39 diff** (not just the analysis).

**Verdict.** Net-positive, land it, but "not done": the high-leverage non-breaking fixes
landed correctly, but the highest-risk items from the analysis were left as-is or only
documented, and the joint breadcrumb+report path was under-tested.

**Valid findings — actioned:**
- **No test covered the actual double-breadcrumb symptom** (`.breadcrumbs().report()` together
  asserting exactly one `addBreadcrumb`). Every existing test had report XOR breadcrumbs.
  → Added regression (`.value()` + `.unwrap()`, asserts 1 add + 1 capture). Commit c41d6f1.

**Valid findings — deferred (already noted in PR body / v2):**
- Global mutable `defaultReporter` static + import-order hazard (pre-existing; not introduced).
- In-flight config-mutation race on the mutable builder (pre-existing).
- `reportError` still passes now-vestigial `breadcrumbData` to `report()` (the factory ignores
  it; harmless, but a latent footgun for custom reporters that read it → interface cleanup, v2).
- Breadcrumb PII / redaction story absent.
- publint `--strict` / attw still flag the ESM **types** masquerade — the deferred `.d.mts`
  split. (PR body already caveats this; "packaging fix" covers runtime + CJS/ESM JS, not types.)
- Disagrees with `minify:true` on a bundler-consumed lib (weak trade-off) — deliberate, kept.

**Corrected (grok overstated):**
- Grok claimed `.value()` / `.error()` / `.result()` all emit breadcrumbs on a non-reporting
  terminal. Verified: only `.value()` does (when `breadcrumbConfig` set and no message — a
  pre-existing, arguably-intended side-effect). **`.error()` and `.result()` are
  side-effect-free** (Try.ts:602-616, 565-575) — no `addBreadcrumbs` call.

---

## Consensus & Synthesis

Two external reviewers (Codex on the analysis, Grok on the implemented PR) + original analysis.
Strong agreement on packaging (peers, exports, LICENSE, publishConfig), the README
mutability/`await` lies, and that the global-reporter / in-flight-mutation / PII / `.d.mts`
items are real but belong in a v2. Grok's one net-new actionable was the missing joint
breadcrumb+report regression test (now added).

### Confirmed corrections to the original analysis
- **`await` footgun reframed:** it *swallows the error* (implicit `.value()`), and DOES
  report if `.report()` is set. Original "no report" wording was imprecise.
- **Optional peers ≠ full MODULE_NOT_FOUND fix:** they add version enforcement + warning,
  but importing a platform entry without its `@sentry/*` still fails at runtime. Pair with
  install docs / clear error.
- **Size re-prioritized:** sourcemaps `false` = the real win; minify = npm-artifact-only;
  `.d.ts removeComments` dropped (hurts IntelliSense).
- **Size numbers caveat:** measured on a stale (Feb-1) local `dist`; rebuild before quoting absolute KB.

### New findings to fold in (verified)
- **HIGH — Next.js double breadcrumbs** (nextjs/SentryReporter.ts:12-19 + Try.ts:767). Fix:
  drop the breadcrumb-adding block in `SentryReporter.report()` (core already adds via
  `addBreadcrumbsIfConfigured`), or stop pre-adding in core and let each adapter own it.
- **HIGH — Publish-artifact correctness** outranks minify (stale dist, exports, peers, LICENSE).
- **MEDIUM — In-flight config mutation race** — strengthens the "mutable builder" finding.
- **MEDIUM — Non-`Error` throw breaks `TryResult.error: Error` type contract.**
- **MEDIUM — Global reporter static / import-order** (already noted; reviewer agrees, raise priority).
- **MEDIUM — Breadcrumb PII/redaction story** missing.

### Revised first-move ordering (analysis + Codex merged)
1. Publish correctness: optional `@sentry/*` peers **+ install docs**, `publishConfig.access:public`,
   `LICENSE`, fix ESM `.mjs/.cjs` exports, ensure dist is freshly built on release.
2. Behavior bugs: nextjs duplicate breadcrumbs; decide global-vs-instance reporter; non-`Error` throws.
3. Size: `sourcemap:false` (primary), `minify:true` (artifact); skip `.d.ts removeComments`.
4. README truth-fixes: `await` semantics, reuse example, mutability, `.report()` terminal scope.
5. v2: `await` footgun, breadcrumb overload reduction, `.report()` split, `TError` generic.
