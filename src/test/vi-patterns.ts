/**
 * Shared test utility factories for common vi.mock() patterns.
 *
 * These factories are called inside consumers' own `vi.hoisted()` blocks
 * where `vi` is already in scope — do NOT import from "vitest" here.
 *
 * See also: `test-utils.tsx` for React render helpers.
 */

/**
 * Factory for the mutable socket context pattern (established in ChatWindow tests).
 *
 * Usage:
 * ```ts
 * const ctx = vi.hoisted(() => makeSocketContext());
 * vi.mock("@/providers/SocketProvider", () => ({
 *   useSocketContext: () => ctx,
 * }));
 * beforeEach(() => {
 *   ctx.chatSocket = null;
 *   ctx.notificationsSocket = null;
 *   ctx.isConnected = false;
 * });
 * ```
 *
 * WARNING: vi.clearAllMocks() resets spy call counts but does NOT reset property
 * mutations on plain objects. Always reset fields manually in beforeEach.
 */
export function makeSocketContext() {
  return {
    chatSocket: null as unknown,
    notificationsSocket: null as unknown,
    isConnected: false,
  };
}

/**
 * Factory for the EventBus handler-capture pattern (established in notification-service tests).
 *
 * Usage:
 * ```ts
 * const { handlerRef, captureHandler } = vi.hoisted(() => makeHandlerRegistry());
 * vi.mock("@/services/event-bus", () => ({
 *   eventBus: { on: vi.fn(captureHandler), emit: vi.fn() },
 * }));
 * // In test: await handlerRef.current.get("event.name")!(payload);
 * ```
 *
 * The Map is shared by reference across test cases. Module-level handlers registered
 * at import time persist across tests — this is intentional and matches production behaviour.
 */
export function makeHandlerRegistry() {
  const handlerRef = { current: new Map<string, (...args: unknown[]) => unknown>() };

  function captureHandler(event: string, handler: (...args: unknown[]) => unknown) {
    handlerRef.current.set(event, handler);
  }

  return { handlerRef, captureHandler };
}

/**
 * Call at the start of any test that uses React Query data + `waitFor`.
 *
 * Root cause: RTL's `waitFor` polls via `setInterval`. With `vi.useFakeTimers()` active,
 * `setInterval` is frozen and `waitFor` hangs indefinitely. Additionally, React Query's
 * async `queryFn` is NOT tracked by `act()` — advancing fake timers inside `act` fires
 * fetch but React Query's state update may not be applied yet.
 *
 * This helper switches the current test to real timers so `waitFor` polls normally.
 * It only affects the calling test; sibling tests retain whatever timer mode is active.
 *
 * Usage:
 * ```ts
 * it("renders fetched data", async () => {
 *   useRealTimersForReactQuery();
 *   render(<MyComponent />);
 *   await waitFor(() => expect(screen.getByText("result")).toBeInTheDocument());
 * });
 * ```
 */
export function useRealTimersForReactQuery() {
  // `vi` is a global in Vitest test files — no import needed here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).vi?.useRealTimers();
}
