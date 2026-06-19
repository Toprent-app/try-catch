import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distPath = (file: string): string => resolve(process.cwd(), 'dist', file);
const read = (file: string): string => readFileSync(distPath(file), 'utf8');
const built = existsSync(distPath('index.js'));

// Static guarantee: only the /node bundle may load node:async_hooks, and the
// /nextjs bundle may reference it only through a guarded dynamic import (so the
// Edge/client runtimes never load it). Skipped when dist is not built.
describe.skipIf(!built)('bundle packaging guards', () => {
  const browserSafe = [
    'index.js',
    'browser/index.js',
    'esm/index.js',
    'esm/browser/index.js',
  ];

  it('browser + bare-core bundles never reference async_hooks', () => {
    for (const file of browserSafe) {
      expect(read(file)).not.toMatch(/async_hooks/);
    }
  });

  it('nextjs references async_hooks only via a guarded dynamic import', () => {
    for (const file of ['nextjs/index.js', 'esm/nextjs/index.js']) {
      const src = read(file);
      // No static import or top-level require of the builtin.
      expect(src).not.toMatch(/from\s*["']node:?async_hooks["']/);
      expect(src).not.toMatch(/require\(["']node:async_hooks["']\)/);
      // Any reference must be the dynamic import().
      if (/async_hooks/.test(src)) {
        expect(src).toMatch(/import\(["']\w*async_hooks["']\)/);
      }
    }
  });

  it('the node bundle loads async_hooks', () => {
    expect(read('node/index.js')).toMatch(/async_hooks/);
  });
});
