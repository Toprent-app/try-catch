---
'@power-rent/try-catch': patch
---

The ESM build now carries a `dist/esm/package.json` with `"type": "module"`. Node 20 before 20.19 read the ESM files as CommonJS and threw `SyntaxError: Unexpected token 'export'` on `import`. Node 22.7 and later only printed a `MODULE_TYPELESS_PACKAGE_JSON` warning.

The `import` condition of every entry now points at ESM declaration files. The default import `import Try from '@power-rent/try-catch'` typechecks for ESM consumers under `moduleResolution: node16` and `nodenext`. Before, the type checker read the CommonJS declarations and reported `TS2351: This expression is not constructable`.
