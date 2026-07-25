---
'@power-rent/try-catch': patch
---

Fix MD-02: positional string entries in `.breadcrumbs([...])` now drop arguments whose value is `undefined`, matching the semantics of `extractFromKeys` for object-key extraction.
