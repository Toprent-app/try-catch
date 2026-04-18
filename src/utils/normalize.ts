/**
 * Normalize any thrown value into a real `Error` instance. If the value is
 * already an `Error`, returned unchanged. Otherwise wrapped in a fresh
 * `Error` whose `message` records the `typeof` and whose `cause` preserves
 * the original value.
 */
export function normalizeThrown(e: unknown): Error {
  if (e instanceof Error) return e;
  const wrapped = new Error(`Non-Error thrown (${typeof e})`);
  wrapped.cause = e;
  return wrapped;
}
