---
'@power-rent/try-catch': patch
---

Reconstructing an `Error` from a thrown error-like payload (`throw await res.json()`) skips own keys that change how the language treats the result: `toString`, `valueOf`, `toLocaleString`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, and `then`, alongside the existing `__proto__`, `constructor`, and `prototype`.

A payload such as `{"message":"...","toString":"..."}` yields an `Error` whose `String(error)` and template interpolation work, and a payload carrying a callable `then` yields an `Error` that `await` resolves to rather than through. All other own enumerable fields (`code`, `statusCode`, ...) are still copied.
