// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

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

vi.mock("@/providers/SocketProvider", () => ({
  usePortalSocket: () => ({
    portalSocket: mockSocket,
    isConnected: true,
    connectionPhase: "connected",
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "current-user-id" } },
    status: "authenticated",
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { usePortalMessages } from "./use-portal-messages";

const APP_ID = "00000000-0000-4000-8000-000000000001";

const makeMsg = (id: string, content = "Hello", createdAt = "2026-04-23T10:00:00.000Z") => ({
  id,
  conversationId: "conv-1",
  senderId: "user-1",
  content,
  contentType: "text",
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt,
});

function makeSuccessResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  mockFetch.mockReset();
});

describe("usePortalMessages", () => {
  it("fetches messages on mount", async () => {
    const msgs = [makeMsg("msg-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ messages: msgs, hasMore: false }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe("msg-1");
  });

  it("sets hasMore from API response", async () => {
    const msgs = [makeMsg("msg-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ messages: msgs, hasMore: true }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });

  it("does not fetch when enabled=false", async () => {
    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, enabled: false }),
    );
    // Give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it("appends real-time message:new from socket (deduped)", async () => {
    const msgs = [makeMsg("msg-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ messages: msgs, hasMore: false }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Trigger new message from socket
    act(() => {
      mockSocket._trigger("message:new", makeMsg("msg-2", "World"));
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]?.id).toBe("msg-2");
    expect(result.current.messages[1]?._status).toBe("delivered");
  });

  it("deduplicates socket message:new if already in messages", async () => {
    const msgs = [makeMsg("msg-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ messages: msgs, hasMore: false }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Trigger same message twice
    act(() => {
      mockSocket._trigger("message:new", makeMsg("msg-1"));
      mockSocket._trigger("message:new", makeMsg("msg-1"));
    });

    // Still just 1 message (the original)
    expect(result.current.messages).toHaveLength(1);
  });

  it("sendMessage inserts optimistic message with 'sending' status", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Don't resolve the POST immediately — capture it
    let resolveSend!: () => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = () =>
          resolve({
            ok: true,
            json: () => Promise.resolve({ data: { message: makeMsg("srv-1", "Hi") } }),
          });
      }),
    );

    act(() => {
      void result.current.sendMessage("Hi");
    });

    // Should have an optimistic message with 'sending' status
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?._status).toBe("sending");
    expect(result.current.messages[0]?.content).toBe("Hi");

    // Now resolve
    act(() => resolveSend());
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));
    expect(result.current.messages[0]?.id).toBe("srv-1");
  });

  it("sendMessage marks message as 'failed' on API error", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    );

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.messages[0]?._status).toBe("failed");
  });

  it("retryMessage resends failed message", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    // First send fails
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    );

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    const failedMsg = result.current.messages[0];
    expect(failedMsg?._status).toBe("failed");
    const optimisticId = failedMsg?._optimisticId ?? "";
    expect(optimisticId).not.toBe("");

    // Retry succeeds
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: makeMsg("srv-2", "Hi") }));

    await act(async () => {
      await result.current.retryMessage(optimisticId);
    });

    expect(result.current.messages[0]?._status).toBe("sent");
    expect(result.current.messages[0]?.id).toBe("srv-2");
  });

  it("loadOlder prepends older messages and updates hasMore", async () => {
    const msgs = [makeMsg("msg-2", "Later", "2026-04-23T11:00:00.000Z")];
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: msgs, hasMore: true }));

    const { result } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const olderMsgs = [makeMsg("msg-1", "Earlier", "2026-04-23T09:00:00.000Z")];
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: olderMsgs, hasMore: false }));

    act(() => {
      result.current.loadOlder();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.id).toBe("msg-1");
    expect(result.current.messages[1]?.id).toBe("msg-2");
    expect(result.current.hasMore).toBe(false);
  });

  it("cleans up socket listeners on unmount", async () => {
    mockFetch.mockReturnValue(makeSuccessResponse({ messages: [], hasMore: false }));
    const { unmount } = renderHook(() => usePortalMessages({ applicationId: APP_ID }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith("message:new", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("message:delivered", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("sync:replay", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("sync:full_refresh", expect.any(Function));
  });
});
