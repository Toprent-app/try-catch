# AGENTS.md

Facts about this repo that the code does not state.

## Toolchain

- Node 20 or newer (`engines`), 24 for local work (`.nvmrc`) and CI tests both. TypeScript 6 only. typescript-eslint supports no TypeScript 7 release, and Renovate keeps `typescript` below 7.
- `npm run check` runs every CI gate: format, lint, typecheck, examples, tests, build, `check:package`. Run it before you push.
- The build runs tsup for JavaScript and `tsc` for declarations. tsup emits no declarations (`dts: false`).
- Prettier ignores `*.md`. The pre-commit hook runs Prettier and ESLint on staged files.

## Tests

- `src/__tests__/docs/doctest.test.ts` runs every fenced block tagged `ts doctest` in `README.md`, `docs/*.md`, and `src/__tests__/docs/__fixtures__/*.md` against `src/`. An unterminated fence fails the suite. Read `src/__tests__/docs/README.md` before you edit a snippet.
- `scripts/check-package.mjs` loads the built package through the `exports` map as ESM and CJS, and typechecks the declarations under node16, nodenext, and bundler. Run it after a change to `exports`, `tsup.config.ts`, or a `tsconfig*.json`.
- `.doctest-tmp/` is scratch space for those two checks. It is git-ignored.

## Releases

- Changesets. Add a changeset for any change to the published package. Tooling-only changes need none.
- Merging the bot's "Version Packages" PR publishes to npm with provenance.

## Documents

- `docs/` holds the maintained documentation. `.planning/` holds planning artifacts and can lag behind the code.
