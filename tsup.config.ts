import { defineConfig, Options } from 'tsup';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ExportsField = Record<
  string,
  string | { import?: string; require?: string; default?: string; types?: string }
>;

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as {
  exports?: ExportsField;
  peerDependencies?: Record<string, string>;
};

function deriveEntriesFromExports(exportsField: ExportsField): Record<string, string> {
  const entries: Record<string, string> = {};
  const stripDot = (p: string) => p.replace(/^\.\//, '');
  const fromEsm = (esmPath: string) =>
    stripDot(esmPath).replace(/^dist\/esm\//, '').replace(/\.js$/, '');

  for (const [subpath, target] of Object.entries(exportsField || {})) {
    // Skip metadata export
    if (subpath.endsWith('package.json')) continue;

    const esmTarget =
      typeof target === 'string'
        ? target
        : target?.import ?? target?.default;

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
  sourcemap: true,           // esbuild embeds sourcesContent by default
  clean: true,
  minify: false,
  splitting: false,          // one file per entry to mirror tsc output
  platform: 'neutral',       // works for node/browser/nextjs entries
  target: 'es2020',
  skipNodeModulesBundle: true,
  external,
  // Force esbuild to emit .js for both formats (override tsup's default .mjs for ESM)
  esbuildOptions(options) {
    options.outExtension = { '.js': '.js' };
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
  },
]);
