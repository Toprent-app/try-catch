/** Own-Error keys handled explicitly so the prop copy never clobbers them. */
const PRESERVED_ERROR_KEYS = new Set(['name', 'message', 'stack', 'cause']);

/**
 * Keys that must never be copied onto the reconstructed Error, because their
 * presence as a plain data property changes how the language itself treats the
 * value. A JSON-parsed payload (`throw await res.json()`) can carry any of them
 * as a real own enumerable key.
 *
 * - `__proto__` repoints the prototype (→ the result fails `instanceof Error`);
 *   `constructor`/`prototype` shadow structural internals.
 * - `toString`, `valueOf`, `toLocaleString`, `hasOwnProperty`, `isPrototypeOf`
 *   and `propertyIsEnumerable` shadow `Object.prototype` methods. A non-callable
 *   `toString`/`valueOf` makes `String(error)` and `` `${error}` `` throw
 *   `Cannot convert object to primitive value` in consumer and reporter code.
 * - `then` makes the Error thenable, so `await` on a value holding it (e.g. the
 *   `Error` returned by `.error()`) resolves the property instead of the error.
 */
const UNSAFE_COPY_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'toLocaleString',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'then',
]);

/** Read a property without ever throwing (the value may be a throwing getter). */
function safeGet(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Stringify for an Error message, never throwing. */
function safeMessage(value: unknown): string {
  try {
    return String(value);
  } catch {
    return 'Unknown non-Error thrown value';
  }
}

/**
 * `Object.prototype.toString` tag, never throwing. The `Symbol.toStringTag`
 * read can invoke a throwing getter on a hostile object.
 */
function safeToStringTag(value: object): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '';
  }
}

/**
 * Structural test for values that carry Error semantics but fail
 * `instanceof Error`: cross-realm / multi-bundle Error instances, transpiled
 * `extends Error` subclasses, and library "error-like" objects
 * (`{ name, message, stack, code, ... }`). Every reflective read is guarded so
 * a hostile getter (including a throwing `Symbol.toStringTag`) can't throw.
 */
function isErrorLike(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (safeToStringTag(value) === '[object Error]') {
    return true;
  }
  return (
    typeof safeGet(value, 'message') === 'string' ||
    typeof safeGet(value, 'name') === 'string'
  );
}

/**
 * Build a real Error from an error-like value, preserving its identity so
 * downstream reporting keeps working: `name` (drives `throwThroughErrorTypes`
 * matching and reporter grouping), `message`, `stack`, every own enumerable
 * custom field (`code`, `statusCode`, ...), and the original via `cause`.
 */
function errorFromErrorLike(value: object): Error {
  const rawMessage = safeGet(value, 'message');
  const error = new Error(
    typeof rawMessage === 'string' ? rawMessage : safeMessage(value),
  );

  const name = safeGet(value, 'name');
  if (typeof name === 'string') {
    error.name = name;
  }
  const stack = safeGet(value, 'stack');
  if (typeof stack === 'string') {
    error.stack = stack;
  }

  // Carry custom fields so reporters (and ignore-by-type) see the originals.
  // `Object.keys` can throw (e.g. a Proxy with a throwing ownKeys trap), so it
  // is guarded too. Skip prototype-mutating keys and define each field as a
  // plain own data property — assignment would invoke the `__proto__`/setter
  // path and could repoint the prototype, breaking `instanceof Error`.
  let ownKeys: string[];
  try {
    ownKeys = Object.keys(value);
  } catch {
    ownKeys = [];
  }
  for (const key of ownKeys) {
    if (PRESERVED_ERROR_KEYS.has(key) || UNSAFE_COPY_KEYS.has(key)) {
      continue;
    }
    const own = safeGet(value, key);
    try {
      Object.defineProperty(error, key, {
        value: own,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } catch {
      // skip props that can't be (re)defined
    }
  }

  try {
    error.cause = value;
  } catch {
    // cause non-writable on this Error — ignore
  }
  return error;
}

/**
 * Normalize an unknown thrown value into an Error without ever throwing.
 *
 * Same-realm Errors pass through untouched. Error-like values that fail
 * `instanceof Error` (cross-realm/bundled Errors, transpiled subclasses, plain
 * `{ name, message, ... }` objects) are reconstructed by {@link errorFromErrorLike}
 * so their identity survives for reporting. Everything else is stringified via
 * a guarded `String(value)` — which can itself throw (null-prototype objects, a
 * throwing `toString`/`Symbol.toPrimitive`) — falling back to a static message,
 * with the original kept on `cause`.
 *
 * This keeps the never-throw contract of `.value()`, `.unwrap()`, `.error()`, and
 * `.result()` intact for non-Error throwables.
 */
export function normalizeThrown(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (isErrorLike(value)) {
    return errorFromErrorLike(value);
  }
  const error = new Error(safeMessage(value));
  try {
    error.cause = value;
  } catch {
    // cause non-writable on this Error — ignore
  }
  return error;
}

/**
 * Read `error.name` without ever throwing.
 *
 * `normalizeThrown` passes `instanceof Error` values through untouched, so a
 * caught error can carry a throwing `name` getter (a Proxy wrapper from an ORM,
 * mock, or observability layer; a subclass with `get name()`). Every
 * `Try.ignoreErrorTypes` membership test goes through here, keeping the
 * never-throw contract of `.value()`, `.error()`, and `.result()` and the
 * throws-only-the-wrapped-error contract of `.unwrap()`.
 *
 * @returns The error's `name` when it is a string, `''` otherwise.
 */
export function safeErrorName(error: Error): string {
  try {
    return typeof error.name === 'string' ? error.name : '';
  } catch {
    return '';
  }
}

/**
 * Read `error.stack` without ever throwing, for the same reason as
 * {@link safeErrorName}: a caught `instanceof Error` value can carry a throwing
 * `stack` getter, and reporters copy the stack onto the wrapped error that
 * `.unwrap()` throws.
 *
 * @returns The error's `stack` when it is a string, `undefined` otherwise.
 */
export function safeErrorStack(error: Error): string | undefined {
  try {
    return typeof error.stack === 'string' ? error.stack : undefined;
  } catch {
    return undefined;
  }
}
