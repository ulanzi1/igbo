// NO "server-only" — used by standalone realtime server and EventBus handlers

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

/**
 * Wraps an async event/socket handler with uniform error containment.
 * - Catches all errors (never re-throws)
 * - Logs structured JSON on failure: { level, handler, error }
 * - Calls Socket.IO ack callback with { error: "Internal error" } if present
 *
 * Mirrors withApiHandler for routes — this is the handler equivalent.
 */
export function withHandlerGuard<T extends AnyFunction>(
  name: string,
  fn: T,
): (...args: Parameters<T>) => Promise<ReturnType<T> | void> {
  return async (...args: Parameters<T>): Promise<ReturnType<T> | void> => {
    try {
      return await fn(...args);
    } catch (err: unknown) {
      try {
        console.error(
          JSON.stringify({
            level: "error",
            handler: name,
            error: String(err),
          }),
        );

        // If last argument is a function (Socket.IO ack callback), call it with error
        const lastArg = args[args.length - 1];
        if (typeof lastArg === "function") {
          lastArg({ error: "Internal error" });
        }
      } catch (_) {
        // Last-resort: swallow to maintain 'never re-throws' contract
      }
    }
  };
}
