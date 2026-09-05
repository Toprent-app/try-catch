/** Runtime `finally` always exists; PublicTry omits it when TReturn is not Promise-like. */
export function withFinally<T>(
  attempt: T,
  callback: () => void | Promise<void>,
): T {
  return (
    attempt as T & {
      finally(cb: () => void | Promise<void>): T;
    }
  ).finally(callback);
}
