# Try sync return behavior design

Date: 2026-02-01

## Goal
Make Try methods return synchronously when the wrapped function is synchronous, and return a Promise when the wrapped function returns a Promise. Behavior should match the async path; the only difference is whether callers need to await.

Applies to: value(), unwrap(), error(), result(), finally().

## Behavior
- If the wrapped function returns a Promise-like, methods behave exactly as today and return a Promise.
- If it returns a non-Promise, methods execute immediately and return plain values.
- Synchronous throws are captured like async rejections.
- value() returns the function result or defaultValue; if an error exists and no defaultValue is set, return undefined.
- unwrap() throws when an error exists; otherwise returns the value.
- error() returns the error or undefined.
- result() returns { success, value, error } with success true only when no error.
- finally() runs immediately after execution on the sync path and returns the same Try-like wrapper as current behavior.

## Internal execution model
- Add a single lazy execution path that runs the function once on first method call.
- Store: isAsync flag, syncResult/syncError, and asyncPromise if Promise-like.
- If Promise-like is returned, set isAsync = true and wrap in then/catch to record state.
- If non-Promise is returned, set isAsync = false and store result/error immediately.

## TypeScript typing
- Use conditional return types based on ReturnType<TFn> being Promise-like:
  - For Promise-like: methods return Promise<...>.
  - For non-Promise: methods return plain values.
- Keep inference from the provided function.

## Tests
- Add tests verifying sync behavior for value/unwrap/error/result/finally:
  - sync success returns value immediately (no Promise)
  - sync throw captured: value returns default or undefined, error returns error, result success=false, unwrap throws
  - finally runs immediately for sync path and returns Try-like wrapper
- Ensure async behavior unchanged (existing tests continue to pass).
- Add type-level tests for conditional return types.

## Documentation
- Update README to show sync usage without await.
- Clarify that async functions still require await.
