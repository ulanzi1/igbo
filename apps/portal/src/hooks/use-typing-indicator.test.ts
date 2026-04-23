// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Socket mock ───────────────────────────────────────────────────────────────
const socketHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    socketHandlers[event] = [...(socketHandlers[event] ?? []), cb];
  }),
  off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    socketHandlers[event] = (socketHandlers[event] ?? []).filter((h) => h !== cb);
  }),
  emit: vi.fn(),
  _trigger: (event: string, ...args: unknown[]) => {
    socketHandlers[event]?.forEach((cb) => cb(...args));
  },
};

const socketState = { socket: mockSocket as typeof mockSocket | null };

vi.mock("@/providers/SocketProvider", () => ({
  usePortalSocket: () => ({
    portalSocket: socketState.socket,
    isConnected: true,
    connectionPhase: "connected",
  }),
}));

import { useTypingIndicator } from "./use-typing-indicator";

const CONV_ID = "conv-1";
const USER_ID = "user-1";
const OTHER_ID = "user-2";

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  socketState.socket = mockSocket;
  mockSocket.emit.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helper ────────────────────────────────────────────────────────────────────

function setupTypingTest(options?: { conversationId?: string; userId?: string }) {
  vi.useFakeTimers();
  const convId = options?.conversationId ?? CONV_ID;
  const uid = options?.userId ?? USER_ID;
  const { result, unmount } = renderHook(() =>
    useTypingIndicator({ conversationId: convId, userId: uid }),
  );
  const triggerStart = (fromUserId: string) =>
    act(() => {
      mockSocket._trigger("typing:start", { userId: fromUserId, conversationId: convId });
    });
  const triggerStop = (fromUserId: string) =>
    act(() => {
      mockSocket._trigger("typing:stop", { userId: fromUserId, conversationId: convId });
    });
  const advanceBy = async (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });
  return { result, unmount, triggerStart, triggerStop, advanceBy };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useTypingIndicator", () => {
  it("sets typingUserId when typing:start event arrives from other user", () => {
    const { result, triggerStart } = setupTypingTest();
    triggerStart(OTHER_ID);
    expect(result.current.typingUserId).toBe(OTHER_ID);
  });

  it("ignores typing:start from self (own userId)", () => {
    const { result, triggerStart } = setupTypingTest();
    triggerStart(USER_ID); // same as userId
    expect(result.current.typingUserId).toBeNull();
  });

  it("clears typingUserId when typing:stop event arrives from other user", () => {
    const { result, triggerStart, triggerStop } = setupTypingTest();
    triggerStart(OTHER_ID);
    expect(result.current.typingUserId).toBe(OTHER_ID);
    triggerStop(OTHER_ID);
    expect(result.current.typingUserId).toBeNull();
  });

  it("ignores typing:stop from self", () => {
    const { result, triggerStart, triggerStop } = setupTypingTest();
    triggerStart(OTHER_ID);
    triggerStop(USER_ID); // self — should be ignored
    // typingUserId still shows the other person
    expect(result.current.typingUserId).toBe(OTHER_ID);
  });

  it("auto-dismisses after 3 seconds of no activity", async () => {
    const { result, triggerStart, advanceBy } = setupTypingTest();
    triggerStart(OTHER_ID);
    expect(result.current.typingUserId).toBe(OTHER_ID);

    // Still showing just before dismiss
    await advanceBy(2999);
    expect(result.current.typingUserId).toBe(OTHER_ID);

    // Dismissed after full 3 seconds
    await advanceBy(1);
    expect(result.current.typingUserId).toBeNull();
  });

  it("new typing:start resets the 3-second dismiss timer", async () => {
    const { result, triggerStart, advanceBy } = setupTypingTest();
    triggerStart(OTHER_ID);

    // Advance 2 seconds (not yet dismissed)
    await advanceBy(2000);
    expect(result.current.typingUserId).toBe(OTHER_ID);

    // Second typing:start arrives — resets timer
    triggerStart(OTHER_ID);

    // Advance another 2 seconds (2s into new timer, not yet dismissed)
    await advanceBy(2000);
    expect(result.current.typingUserId).toBe(OTHER_ID);

    // Advance remaining 1 second (3s total from last event)
    await advanceBy(1000);
    expect(result.current.typingUserId).toBeNull();
  });

  it("typing:stop before any typing:start leaves typingUserId as null", () => {
    const { result, triggerStop } = setupTypingTest();
    triggerStop(OTHER_ID);
    expect(result.current.typingUserId).toBeNull();
  });

  it("typing:start then immediate typing:stop clears indicator", () => {
    const { result, triggerStart, triggerStop } = setupTypingTest();
    triggerStart(OTHER_ID);
    expect(result.current.typingUserId).toBe(OTHER_ID);
    triggerStop(OTHER_ID);
    expect(result.current.typingUserId).toBeNull();
  });

  it("emitTypingStart is throttled to 1 per 2 seconds", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useTypingIndicator({ conversationId: CONV_ID, userId: USER_ID }),
    );

    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith("typing:start", { conversationId: CONV_ID });

    // Second call within 2s — throttled
    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);

    // Still throttled at 1999ms
    await act(async () => vi.advanceTimersByTime(1999));
    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);

    // Allowed after 2000ms have passed from first emit
    await act(async () => vi.advanceTimersByTime(1));
    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
  });

  it("emitTypingStop resets throttle counter so next start fires immediately", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useTypingIndicator({ conversationId: CONV_ID, userId: USER_ID }),
    );

    // Emit start (throttle starts)
    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);

    // Emit stop (resets throttle + sends stop)
    act(() => result.current.emitTypingStop());
    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    expect(mockSocket.emit).toHaveBeenCalledWith("typing:stop", { conversationId: CONV_ID });

    // Emit start immediately after stop — throttle reset, so it fires
    act(() => result.current.emitTypingStart());
    expect(mockSocket.emit).toHaveBeenCalledTimes(3);
  });

  it("events filtered by conversationId", () => {
    const { result } = setupTypingTest({ conversationId: CONV_ID });

    // Event for a different conversation — must be ignored
    act(() => {
      mockSocket._trigger("typing:start", { userId: OTHER_ID, conversationId: "conv-other" });
    });
    expect(result.current.typingUserId).toBeNull();
  });

  it("cleanup clears dismiss timer and removes listeners on unmount", async () => {
    const { result, triggerStart, unmount, advanceBy } = setupTypingTest();
    triggerStart(OTHER_ID);
    expect(result.current.typingUserId).toBe(OTHER_ID);

    unmount();

    // Timer should be cleared — advance past dismiss window
    await advanceBy(4000);
    // No crashes and listeners removed
    expect(mockSocket.off).toHaveBeenCalledWith("typing:start", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("typing:stop", expect.any(Function));
  });
});
