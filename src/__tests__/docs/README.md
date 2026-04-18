# Doctest Harness (DX-01)

This directory contains the Vitest-based doctest harness that executes
fenced code snippets embedded in the project's user-facing docs, so CI
fails the moment a snippet stops matching real behavior.

## Marker Convention

Only fenced blocks tagged with the doctest marker are extracted and run
(per decision **D-04**):

````markdown
```ts doctest
import { Try } from '@power-rent/try-catch';
const ok = await new Try(() => 42).value();
if (ok !== 42) throw new Error('doctest failed');
```
````

Rules:

- The info string must start with `ts` or `typescript`.
- The token `doctest` must appear (whitespace-separated) after the language.
- `` ```ts `` without `doctest` is skipped (use it for pedagogical or
  illustrative code that should not execute).
- `` ```bash ``, `` ```json ``, and any other language are always skipped.
- An unterminated tagged fence fails the harness loudly.

## Execution Contract

Every tagged snippet runs inside the vitest suite `doctest.test.ts`:

- **Reporter:** `Try.setDefaultReporter(new NoopReporter())` before each
  snippet; prior reporter restored after (D-06).
- **Sentry:** `@sentry/node`, `@sentry/browser`, `@sentry/nextjs` are
  `vi.mock`-ed at module scope — no real Sentry traffic (D-06).
- **Imports:** snippets must use the package names
  (`@power-rent/try-catch`, `@power-rent/try-catch/node`,
  `@power-rent/try-catch/browser`, `@power-rent/try-catch/nextjs`).
  The vitest alias config wires these to local `src/` so snippets stay
  copy-pasteable for users while still exercising real code (D-05).
- **Assertions:** snippets self-assert with plain `if (...) throw new Error(...)`;
  keep them small and independent.

## Tracked Doc Surface

The suite scans, in order:

1. `README.md` at the repo root.
2. Every `docs/*.md` file (alphabetical).
3. Every `*.md` under `__fixtures__/` (seeded snippets used during
   harness bring-up and regression testing).

If **zero** tagged snippets are discovered across the entire surface,
the suite fails with a clear error. There is no silent-pass skip branch.

## Adding a Snippet

1. Pick the file (usually `README.md` or one of `docs/*.md`).
2. Open a fenced block with `` ```ts doctest ``.
3. Import from the public package names only — no `../../src` paths.
4. Self-assert the behavior you're demonstrating.
5. Run `npm test` — the snippet is now enforced.

## Temporarily Skipping a Snippet

Remove the `doctest` token from the info string (leave `` ```ts `` in
place). The block will still render in Markdown but will no longer be
executed. Prefer this over deleting the block.

## Files

| File | Purpose |
| ---- | ------- |
| `doctest-extract.ts` | Marker-based fenced-block extractor (reusable). |
| `doctest-extract.test.ts` | Unit tests for the extractor. |
| `doctest.test.ts` | The suite that runs every discovered snippet. |
| `__fixtures__/*.md` | Seed + regression snippets. |
