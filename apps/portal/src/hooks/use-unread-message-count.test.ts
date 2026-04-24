// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Socket mock ────────────────────────────────────────────────────────────────
const socketHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
let mockIsConnected = true;

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

vi.mock("@/providers/SocketProvider", () => ({
  usePortalSocket: () => ({
    portalSocket: mockSocket,
    isConnected: mockIsConnected,
  }),
}));

// ── Session mock ───────────────────────────────────────────────────────────────
const sessionState: { data: { user: { id: string } } | null } = {
  data: { user: { id: "user-1" } },
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: sessionState.data,
    status: sessionState.data ? "authenticated" : "unauthenticated",
  }),
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useUnreadMessageCount } from "./use-unread-message-count";

function makeConvResponse(conversations: Array<{ id: string; unreadCount: number }>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: { conversations } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  mockIsConnected = true;
  mockFetch.mockReset();
  sessionState.data = { user: { id: "user-1" } };
});

describe("useUnreadMessageCount", () => {
  it("initial fetch sums unread counts from API response", async () => {
    mockFetch.mockReturnValue(
      makeConvResponse([
        { id: "conv-1", unreadCount: 3 },
        { id: "conv-2", unreadCount: 2 },
      ]),
    );

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(result.current.totalUnread).toBe(5));
  });

  it("returns 0 when all conversations have zero unread", async () => {
    mockFetch.mockReturnValue(
      makeConvResponse([
        { id: "conv-1", unreadCount: 0 },
        { id: "conv-2", unreadCount: 0 },
      ]),
    );

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(result.current.totalUnread).toBe(0);
  });

  it("message:new from another user increments totalUnread locally without re-fetch", async () => {
    mockFetch.mockReturnValue(makeConvResponse([{ id: "conv-1", unreadCount: 0 }]));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    act(() => {
      mockSocket._trigger("message:new", {
        conversationId: "conv-1",
        senderId: "other-user",
      });
    });

    expect(result.current.totalUnread).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no re-fetch
  });

  it("message:new from self does NOT increment totalUnread", async () => {
    mockFetch.mockReturnValue(makeConvResponse([{ id: "conv-1", unreadCount: 0 }]));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    act(() => {
      mockSocket._trigger("message:new", {
        conversationId: "conv-1",
        senderId: "user-1", // same as current user
      });
    });

    expect(result.current.totalUnread).toBe(0);
  });

  it("resetConversation(id) zeroes that conversation's count", async () => {
    mockFetch.mockReturnValue(makeConvResponse([{ id: "conv-1", unreadCount: 5 }]));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(result.current.totalUnread).toBe(5));

    act(() => {
      result.current.resetConversation("conv-1");
    });

    expect(result.current.totalUnread).toBe(0);
  });

  it("resetConversation does not affect other conversations", async () => {
    mockFetch.mockReturnValue(
      makeConvResponse([
        { id: "conv-1", unreadCount: 3 },
        { id: "conv-2", unreadCount: 2 },
      ]),
    );

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(result.current.totalUnread).toBe(5));

    act(() => {
      result.current.resetConversation("conv-1");
    });

    expect(result.current.totalUnread).toBe(2);
  });

  it("totalUnread never goes below 0", async () => {
    mockFetch.mockReturnValue(makeConvResponse([]));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.resetConversation("nonexistent-conv");
    });

    expect(result.current.totalUnread).toBe(0);
  });

  it("handles fetch error gracefully — totalUnread stays at 0", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(result.current.totalUnread).toBe(0);
  });

  it("handles non-ok HTTP response gracefully — totalUnread stays at 0", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(result.current.totalUnread).toBe(0);
  });

  it("socket reconnect triggers re-fetch and restores authoritative count", async () => {
    mockFetch
      .mockReturnValueOnce(makeConvResponse([{ id: "conv-1", unreadCount: 2 }]))
      .mockReturnValueOnce(makeConvResponse([{ id: "conv-1", unreadCount: 0 }]));

    const { result, rerender } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(result.current.totalUnread).toBe(2));

    // Simulate disconnect
    mockIsConnected = false;
    rerender();

    // Simulate reconnect
    mockIsConnected = true;
    rerender();

    // Wait for the second fetch AND the subsequent state update
    await waitFor(() => expect(result.current.totalUnread).toBe(0));
  });

  it("does not re-fetch on reconnect before first fetch has occurred", async () => {
    // Simulate: user is unauthenticated initially (no fetch), then connects
    sessionState.data = null;
    mockIsConnected = false;

    const { rerender } = renderHook(() => useUnreadMessageCount());

    // Reconnect while still unauthenticated
    mockIsConnected = true;
    rerender();

    await waitFor(() => expect(mockFetch).not.toHaveBeenCalled());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("race: message:new increments then resetConversation zeroes — final count is 0", async () => {
    mockFetch.mockReturnValue(makeConvResponse([{ id: "conv-1", unreadCount: 0 }]));

    const { result } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Message arrives (count goes to 1)
    act(() => {
      mockSocket._trigger("message:new", {
        conversationId: "conv-1",
        senderId: "other-user",
      });
    });
    expect(result.current.totalUnread).toBe(1);

    // User opens conversation (count zeroed)
    act(() => {
      result.current.resetConversation("conv-1");
    });
    expect(result.current.totalUnread).toBe(0);
  });

  it("does not fetch when unauthenticated", async () => {
    sessionState.data = null;

    renderHook(() => useUnreadMessageCount());
    // Wait a bit to confirm no fetch is triggered
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches only once on mount even after multiple re-renders", async () => {
    mockFetch.mockReturnValue(makeConvResponse([]));

    const { rerender } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("cleans up socket listener on unmount", async () => {
    mockFetch.mockReturnValue(makeConvResponse([]));

    const { unmount } = renderHook(() => useUnreadMessageCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith("message:new", expect.any(Function));
  });
});
