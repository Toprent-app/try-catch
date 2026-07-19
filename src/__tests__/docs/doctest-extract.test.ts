import { describe, it, expect } from 'vitest';
import { extractDoctests } from './doctest-extract';

describe('extractDoctests', () => {
  it('extracts a single tagged ```ts doctest``` fenced block', () => {
    const source = [
      '# Title',
      '',
      '```ts doctest',
      'const x = 1;',
      'console.log(x);',
      '```',
      '',
      'Trailing prose.',
    ].join('\n');

    const blocks = extractDoctests(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const x = 1;\nconsole.log(x);');
    expect(blocks[0].index).toBe(0);
    expect(blocks[0].startLine).toBe(3);
  });

  it('accepts the typescript alias in the info string', () => {
    const source = [
      '```typescript doctest',
      'const y = 2;',
      '```',
    ].join('\n');

    const blocks = extractDoctests(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const y = 2;');
  });

  it('skips ts blocks without the doctest marker', () => {
    const source = [
      '```ts',
      'const ignored = true;',
      '```',
    ].join('\n');

    expect(extractDoctests(source)).toHaveLength(0);
  });

  it('skips typescript blocks without the doctest marker', () => {
    const source = [
      '```typescript',
      'const ignored = true;',
      '```',
    ].join('\n');

    expect(extractDoctests(source)).toHaveLength(0);
  });

  it('skips bash fenced blocks regardless of tokens', () => {
    const source = [
      '```bash',
      'npm install @power-rent/try-catch',
      '```',
      '',
      '```bash doctest',
      'echo "still not executed"',
      '```',
    ].join('\n');

    expect(extractDoctests(source)).toHaveLength(0);
  });

  it('extracts multiple tagged blocks with correct index + startLine metadata', () => {
    const source = [
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
    ].join('\n');

    const blocks = extractDoctests(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toBe('const a = 1;');
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[0].index).toBe(0);
    expect(blocks[1].code).toBe('const b = 2;\nconst c = 3;');
    expect(blocks[1].startLine).toBe(7);
    expect(blocks[1].index).toBe(1);
  });

  it('throws a descriptive error on an unterminated fenced block', () => {
    const source = [
      '```ts doctest',
      'const oops = "no close fence";',
    ].join('\n');

    expect(() => extractDoctests(source)).toThrow(/unterminated/i);
  });

  it('ignores the doctest marker when the first token is neither ts nor typescript', () => {
    const source = [
      '```js doctest',
      'const x = 1;',
      '```',
    ].join('\n');

    expect(extractDoctests(source)).toHaveLength(0);
  });

  it('requires doctest to be a whitespace-separated token (not a substring)', () => {
    const source = [
      '```ts notdoctestly',
      'const x = 1;',
      '```',
    ].join('\n');

    expect(extractDoctests(source)).toHaveLength(0);
  });
});
