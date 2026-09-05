import { describe, it, expect } from 'vitest';
import { extractDoctests } from './doctest-extract';

const md = (...lines: string[]) => lines.join('\n');

describe('extractDoctests', () => {
  it('extracts a single tagged ```ts doctest``` fenced block', () => {
    const source = md(
      '# Title',
      '',
      '```ts doctest',
      'const x = 1;',
      'console.log(x);',
      '```',
      '',
      'Trailing prose.',
    );

    const blocks = extractDoctests(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const x = 1;\nconsole.log(x);');
    expect(blocks[0].index).toBe(0);
    expect(blocks[0].startLine).toBe(3);
  });

  it('accepts the typescript alias in the info string', () => {
    const blocks = extractDoctests(
      md('```typescript doctest', 'const y = 2;', '```'),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const y = 2;');
  });

  // Only `ts`/`typescript` carrying `doctest` as its own token opts a block in.
  // Everything else stays documentation, so it must never reach the runner.
  it.each([
    ['a ts block with no marker', md('```ts', 'const ignored = true;', '```')],
    [
      'a typescript block with no marker',
      md('```typescript', 'const ignored = true;', '```'),
    ],
    [
      'bash blocks whatever their tokens',
      md(
        '```bash',
        'npm install @power-rent/try-catch',
        '```',
        '',
        '```bash doctest',
        'echo "still not executed"',
        '```',
      ),
    ],
    [
      'a language that is neither ts nor typescript',
      md('```js doctest', 'const x = 1;', '```'),
    ],
    [
      'doctest appearing only as a substring',
      md('```ts notdoctestly', 'const x = 1;', '```'),
    ],
  ])('skips %s', (_case, source) => {
    expect(extractDoctests(source)).toHaveLength(0);
  });

  it('extracts multiple tagged blocks with correct index + startLine metadata', () => {
    const source = md(
      '```ts doctest',
      'const a = 1;',
      '```',
      '',
      'Prose between.',
      '',
      '```ts doctest',
      'const b = 2;',
      'const c = 3;',
      '```',
    );

    const blocks = extractDoctests(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toBe('const a = 1;');
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[0].index).toBe(0);
    expect(blocks[1].code).toBe('const b = 2;\nconst c = 3;');
    expect(blocks[1].startLine).toBe(7);
    expect(blocks[1].index).toBe(1);
  });

  // Silent truncation would drop docs coverage without anyone noticing, so an
  // unclosed fence is an error whether or not it was tagged.
  it.each([
    ['tagged', md('```ts doctest', 'const oops = "no close fence";')],
    ['untagged', md('```bash', 'echo "no close fence"')],
  ])(
    'throws a descriptive error on an unterminated %s fenced block',
    (_case, source) => {
      expect(() => extractDoctests(source)).toThrow(/unterminated/i);
    },
  );

  it('keeps a four-backtick block whole when it displays a triple-backtick doctest', () => {
    const source = md(
      '````markdown',
      '```ts doctest',
      'const displayed = 1;',
      '```',
      '````',
      '',
      '```ts doctest',
      'const real = 2;',
      '```',
    );

    const blocks = extractDoctests(source);

    // The displayed snippet is documentation about the marker, not a snippet to
    // run; only the real one after the outer block is collected.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const real = 2;');
    expect(blocks[0].startLine).toBe(7);
  });

  it('closes a four-backtick doctest fence only on a run of at least four backticks', () => {
    const blocks = extractDoctests(
      md('````ts doctest', 'const inner = "```";', '````'),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const inner = "```";');
  });
});
