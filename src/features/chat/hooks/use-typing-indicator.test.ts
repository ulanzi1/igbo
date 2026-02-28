// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock SocketProvider
const mockChatSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => ({ chatSocket: mockChatSocket, notificationsSocket: null }),
}));

import { useTypingIndicator } from "./use-typing-indicator";

const CONV_ID = "conv-123";
const USER_A = "user-aaa";
const USER_B = "user-bbb";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTypingIndicator", () => {
  it("subscribes to typing:start and typing:stop on chatSocket", () => {
    renderHook(() => useTypingIndicator(CONV_ID));

    expect(mockChatSocket.on).toHaveBeenCalledWith("typing:start", expect.any(Function));
    expect(mockChatSocket.on).toHaveBeenCalledWith("typing:stop", expect.any(Function));
  });

  it("adds userId to typingUserIds on typing:start", () => {
    const { result } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });

    expect(result.current.typingUserIds).toContain(USER_A);
  });

  it("removes userId from typingUserIds on typing:stop", () => {
    const { result } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;
    const stopHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:stop",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });
    expect(result.current.typingUserIds).toContain(USER_A);

    act(() => {
      stopHandler({ userId: USER_A, conversationId: CONV_ID });
    });
    expect(result.current.typingUserIds).not.toContain(USER_A);
  });

  it("ignores events for wrong conversationId", () => {
    const { result } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: "different-conv" });
    });

    expect(result.current.typingUserIds).not.toContain(USER_A);
  });

  it("auto-expires after AUTO_EXPIRE_MS (6000ms)", () => {
    const { result } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });
    expect(result.current.typingUserIds).toContain(USER_A);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(result.current.typingUserIds).not.toContain(USER_A);
  });

  it("resets auto-expire timer when user starts typing again", () => {
    const { result } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });

    // Advance 4s (not expired yet)
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.typingUserIds).toContain(USER_A);

    // Re-emit typing:start — should reset the timer
    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });

    // Advance 4s from re-emit — still within 6s window
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.typingUserIds).toContain(USER_A);

    // Advance another 2s — now 6s from re-emit
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.typingUserIds).not.toContain(USER_A);
  });

  it("calls chatSocket.off on unmount", () => {
    const { unmount } = renderHook(() => useTypingIndicator(CONV_ID));
    unmount();

    expect(mockChatSocket.off).toHaveBeenCalledWith("typing:start", expect.any(Function));
    expect(mockChatSocket.off).toHaveBeenCalledWith("typing:stop", expect.any(Function));
  });

  it("resets typingUserIds when conversationId changes", () => {
    const { result, rerender } = renderHook(({ convId }) => useTypingIndicator(convId), {
      initialProps: { convId: CONV_ID },
    });

    // Get handler for initial conversation
    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
    });
    expect(result.current.typingUserIds).toContain(USER_A);

    // Switch conversation
    rerender({ convId: "conv-456" });

    // typingUserIds should be reset
    expect(result.current.typingUserIds).toHaveLength(0);
  });

  it("clears all timers on unmount (no memory leak)", () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { result, unmount } = renderHook(() => useTypingIndicator(CONV_ID));

    const startHandler = mockChatSocket.on.mock.calls.find(
      (c) => c[0] === "typing:start",
    )![1] as (payload: { userId: string; conversationId: string }) => void;

    act(() => {
      startHandler({ userId: USER_A, conversationId: CONV_ID });
      startHandler({ userId: USER_B, conversationId: CONV_ID });
    });

    expect(result.current.typingUserIds).toHaveLength(2);

    clearTimeoutSpy.mockClear();
    unmount();

    // Should clear timers for both users (at least once per active user)
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
