/**
 * Doctest extractor — the marker-based fenced-block reader for the doctest harness.
 *
 * The vitest suite executes tagged snippets from README + docs/*.md. The
 * tagging convention is ```ts doctest``` — info-string must start with `ts`
 * or `typescript` AND contain `doctest` as a whitespace-separated token. Any
 * other fenced block is skipped. The extractor returns raw code; the harness
 * wires imports to local src via vitest aliases rather than rewriting snippets.
 *
 * Kept intentionally small (no markdown parser dependency). Walks lines,
 * detects fence open/close, accumulates body for matching blocks.
 */

export interface DoctestBlock {
  /** Raw snippet body (no trailing newline). */
  readonly code: string;
  /** Zero-based index among all extracted (tagged) blocks in the source. */
  readonly index: number;
  /** 1-based line number of the opening fence within the source. */
  readonly startLine: number;
}

const FENCE_OPEN = /^```(\S+)(?:\s+(.*))?$/;
const FENCE_CLOSE = /^```\s*$/;

/**
 * Extract tagged doctest snippets from a Markdown source string.
 *
 * Rules:
 *   - Opening fence info string must begin with `ts` or `typescript`.
 *   - Remaining tokens (whitespace-separated) must include `doctest`.
 *   - Everything else (including ```ts without doctest, ```bash, prose) is skipped.
 *   - Unterminated tagged fences throw — silent truncation would mask dropped
 *     docs coverage.
 */
export function extractDoctests(source: string): DoctestBlock[] {
  const lines = source.split(/\r?\n/);
  const blocks: DoctestBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = FENCE_OPEN.exec(line);

    if (!match) {
      i += 1;
      continue;
    }

    const lang = match[1];
    const rest = match[2] || '';
    const tagged = isDoctestFence(lang, rest);
    const openLine = i + 1; // 1-based

    // Walk to the close fence regardless of whether we're keeping this block,
    // so nested "```" tokens in untagged blocks don't confuse the scanner.
    const bodyStart = i + 1;
    let j = bodyStart;
    while (j < lines.length && !FENCE_CLOSE.test(lines[j])) {
      j += 1;
    }

    if (j >= lines.length) {
      const kind = tagged ? 'doctest fence' : 'fence';
      throw new Error(
        `extractDoctests: unterminated ${kind} opened at line ${openLine}`,
      );
    }

    if (tagged) {
      const code = lines.slice(bodyStart, j).join('\n');
      blocks.push({ code, index: blocks.length, startLine: openLine });
    }

    i = j + 1;
  }

  return blocks;
}

function isDoctestFence(lang: string, rest: string): boolean {
  if (lang !== 'ts' && lang !== 'typescript') return false;
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  return tokens.includes('doctest');
}
