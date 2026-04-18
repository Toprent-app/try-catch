/**
 * Doctest suite — executes every tagged fenced snippet in README.md,
 * docs/*.md, and __fixtures__/*.md under a Noop reporter with all
 * @sentry/* packages mocked.
 *
 * Design references: D-03 (vitest-based harness), D-04 (marker = ts doctest),
 * D-05 (package-name imports via vitest aliases), D-06 (Noop default
 * reporter + mocked Sentry adapters).
 *
 * Zero-snippet policy: if no tagged snippet is found across the entire
 * tracked doc surface, the suite fails. The seed fixture keeps Wave 1
 * green before real docs carry the marker.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

// Per D-06: mock Sentry entry points so snippets never hit real Sentry.
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Smoke-check the vitest alias wiring (Task 1, D-05).
import { Try, NoopReporter } from '@power-rent/try-catch';

import { extractDoctests, type DoctestBlock } from './doctest-extract';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const FIXTURES_DIR = path.join(__dirname, '__fixtures__');
const TEMP_DIR = path.join(REPO_ROOT, 'node_modules', '.doctest');

interface DiscoveredFile {
  readonly absPath: string;
  readonly relPath: string;
  readonly blocks: readonly DoctestBlock[];
}

function discoverFiles(): DiscoveredFile[] {
  const paths: string[] = [];

  // README.md at repo root.
  const readme = path.join(REPO_ROOT, 'README.md');
  if (fs.existsSync(readme)) paths.push(readme);

  // docs/*.md (tolerate missing directory).
  if (fs.existsSync(DOCS_DIR) && fs.statSync(DOCS_DIR).isDirectory()) {
    for (const name of fs.readdirSync(DOCS_DIR).sort()) {
      if (name.endsWith('.md')) paths.push(path.join(DOCS_DIR, name));
    }
  }

  // __fixtures__/*.md.
  if (fs.existsSync(FIXTURES_DIR)) {
    for (const name of fs.readdirSync(FIXTURES_DIR).sort()) {
      if (name.endsWith('.md')) paths.push(path.join(FIXTURES_DIR, name));
    }
  }

  return paths.map((absPath) => {
    const relPath = path.relative(REPO_ROOT, absPath);
    const source = fs.readFileSync(absPath, 'utf8');
    const blocks = extractDoctests(source);
    return { absPath, relPath, blocks };
  });
}

const files = discoverFiles();
const totalBlocks = files.reduce((n, f) => n + f.blocks.length, 0);

describe('doctest harness (DX-01)', () => {
  it('resolves @power-rent/try-catch via vitest alias (D-05 smoke)', () => {
    expect(Try).toBeDefined();
    expect(typeof Try).toBe('function');
    expect(NoopReporter).toBeDefined();
  });

  it('discovers at least one tagged snippet across the tracked surface', () => {
    if (totalBlocks === 0) {
      throw new Error(
        'No doctest snippets found — DX-01 harness requires at least one tagged snippet. ' +
          'Expected coverage: README.md + docs/*.md + src/__tests__/docs/__fixtures__/*.md.',
      );
    }
    expect(totalBlocks).toBeGreaterThan(0);
  });
});

let priorReporter: ReturnType<typeof Try.getDefaultReporter> | undefined;

beforeAll(() => {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
});

afterAll(() => {
  // Best-effort cleanup; ignore failures (e.g., concurrent runs).
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  priorReporter = Try.getDefaultReporter();
  Try.setDefaultReporter(new NoopReporter());
});

afterEach(() => {
  if (priorReporter) Try.setDefaultReporter(priorReporter);
});

for (const file of files) {
  if (file.blocks.length === 0) continue;

  describe(`${file.relPath} doctest (DX-01)`, () => {
    it.each(file.blocks.map((b) => [b.startLine, b] as const))(
      'line %i',
      async (_startLine, block) => {
        const tmpFile = path.join(TEMP_DIR, `${randomUUID()}.ts`);
        fs.writeFileSync(tmpFile, block.code, 'utf8');
        try {
          await import(/* @vite-ignore */ tmpFile);
        } catch (err) {
          const origin = `${file.relPath}:${block.startLine}`;
          const base = err instanceof Error ? err : new Error(String(err));
          const wrapped = new Error(
            `doctest snippet failed at ${origin}\n${base.message}`,
          );
          wrapped.cause = base;
          wrapped.stack = base.stack;
          throw wrapped;
        } finally {
          try {
            fs.unlinkSync(tmpFile);
          } catch {
            /* ignore */
          }
        }
      },
    );
  });
}
