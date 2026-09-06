/**
 * Consume the built package the way a user does: through the `exports` map,
 * as ESM and as CommonJS, at run time and in the type checker.
 *
 * Node and TypeScript resolve the package name from inside the repository
 * through the package self-reference rule, so this script needs no
 * `npm pack` step. Run it after `npm run build`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const PKG = '@power-rent/try-catch';
const ENTRIES = ['', '/node', '/browser', '/nextjs'];
const TMP_DIR = '.doctest-tmp/check-package';
const failures = [];

const require = createRequire(import.meta.url);

for (const entry of ENTRIES) {
  const specifier = `${PKG}${entry}`;
  const esm = await import(specifier);
  if (typeof esm.default !== 'function' || esm.default !== esm.Try) {
    failures.push(`ESM ${specifier}: the default export is not Try`);
  }
  const cjs = require(specifier);
  if (typeof cjs.default !== 'function' || cjs.default !== cjs.Try) {
    failures.push(`CJS ${specifier}: the default export is not Try`);
  }
}

// One consumer file per module format. The `@ts-expect-error` line proves
// that the declarations resolve to real types: when they collapse to `any`,
// the directive becomes unused and tsc reports an error.
const consumer = ENTRIES.map(
  (entry, i) =>
    `import Try${i} from '${PKG}${entry}';\n` +
    `export const value${i}: number | undefined = new Try${i}(() => 1).value();\n` +
    `// @ts-expect-error the value is a number, not a string\n` +
    `export const wrong${i}: string = new Try${i}(() => 1).value();\n`,
).join('\n');

rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(`${TMP_DIR}/esm.mts`, consumer);
writeFileSync(`${TMP_DIR}/cjs.cts`, consumer);

const RESOLUTIONS = [
  {
    name: 'node16',
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    files: [`${TMP_DIR}/esm.mts`, `${TMP_DIR}/cjs.cts`],
  },
  {
    name: 'nodenext',
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    files: [`${TMP_DIR}/esm.mts`, `${TMP_DIR}/cjs.cts`],
  },
  {
    name: 'bundler',
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    files: [`${TMP_DIR}/esm.mts`],
  },
];

for (const { name, module, moduleResolution, files } of RESOLUTIONS) {
  const program = ts.createProgram(files, {
    noEmit: true,
    strict: true,
    esModuleInterop: true,
    module,
    moduleResolution,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const text = ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    });
    failures.push(`tsc --moduleResolution ${name}:\n${text}`);
  }
}

rmSync(TMP_DIR, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(
  `check-package: ${ENTRIES.length} entries load as ESM and CJS; declarations typecheck under node16, nodenext, and bundler`,
);
