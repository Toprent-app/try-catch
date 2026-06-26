import { defineConfig, Options } from 'tsup';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ExportsField = Record<
  string,
  | string
  | { import?: string; require?: string; default?: string; types?: string }
>;

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as {
  exports?: ExportsField;
  peerDependencies?: Record<string, string>;
};

function deriveEntriesFromExports(
  exportsField: ExportsField,
): Record<string, string> {
  const entries: Record<string, string> = {};
  const stripDot = (p: string) => p.replace(/^\.\//, '');
  const fromEsm = (esmPath: string) =>
    stripDot(esmPath)
      .replace(/^dist\/esm\//, '')
      .replace(/\.js$/, '');

  for (const [subpath, target] of Object.entries(exportsField || {})) {
    // Skip metadata export
    if (subpath.endsWith('package.json')) continue;

    const esmTarget =
      typeof target === 'string' ? target : (target?.import ?? target?.default);

    if (!esmTarget || !esmTarget.includes('/dist/esm/')) continue;
    const rel = fromEsm(esmTarget); // e.g. "index", "nextjs/index"
    entries[rel] = `src/${rel}.ts`;
  }

  if (Object.keys(entries).length === 0) {
    entries.index = 'src/index.ts';
  }
  return entries;
}

const externalPeers = Object.keys(pkg.peerDependencies || {});
const sentryManual = [
  '@sentry/core',
  '@sentry/node',
  '@sentry/browser',
  '@sentry/nextjs',
  '@sentry/tracing',
  '@sentry/types',
  '@sentry/utils',
  '@sentry/react',
  '@sentry/integrations',
];
const external = Array.from(new Set([...externalPeers, ...sentryManual]));

const entries = deriveEntriesFromExports(pkg.exports || {});

const common: Options = {
  entry: entries,
  sourcemap: false, // do not ship sourcemaps (they embedded full TS source — ~80% of the published tarball)
  clean: true,
  minify: true, // minify the published artifact (Sentry externals are untouched)
  splitting: false, // one file per entry to mirror tsc output
  platform: 'neutral', // works for node/browser/nextjs entries
  target: 'es2022', // matches engines node>=20 and the Error.cause usage
  skipNodeModulesBundle: true,
  external,
  // Force esbuild to emit .js for both formats (override tsup's default .mjs for ESM)
  esbuildOptions(options) {
    options.outExtension = { '.js': '.js' };
    // Preserve function/class names under minify so this library's own frames
    // stay readable in consumers' Sentry stack traces (identifiers are mangled
    // otherwise, and we ship no sourcemaps).
    options.keepNames = true;
  },
};

export default defineConfig([
  {
    ...common,
    format: 'cjs',
    outDir: 'dist',
    dts: {
      entry: entries,
      resolve: true,
    },
  },
  {
    ...common,
    format: 'esm',
    outDir: 'dist/esm',
    dts: false,
    // The package root has no "type" field (defaults to CommonJS), so emit a
    // marker telling Node that the ESM output directory contains ES modules.
    // Without this, `import` consumers on native Node parse these .js files as
    // CJS and crash on the ESM syntax.
    onSuccess: 'echo \'{"type":"module"}\' > dist/esm/package.json',
  },
]);
