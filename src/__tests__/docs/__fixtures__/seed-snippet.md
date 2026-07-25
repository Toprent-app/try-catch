# Seed Doctest Fixture

This fixture exists solely to prove the doctest pipeline end-to-end during
Wave 1 before real `README.md` / `docs/*.md` snippets carry the marker.

Do not delete it until Wave 2 has tagged at least one real doc snippet —
the harness fails with "no snippets found" if zero tagged blocks are
discovered across the entire tracked surface.

```ts doctest
import { Try } from '@power-rent/try-catch';

const value = await new Try(() => 40 + 2).value();
if (value !== 42) {
  throw new Error(`seed snippet expected 42, got ${String(value)}`);
}
```
