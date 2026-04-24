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
    expect(mockSocket.off).toHaveBeenCalledWith("message:read", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("sync:replay", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("sync:full_refresh", expect.any(Function));
  });

  it("message:read promotes own sent message to read", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    const sentMsg = { ...makeMsg("srv-1"), senderId: "current-user-id" };
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: sentMsg }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));

    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.messages[0]?._status).toBe("read");
  });

  it("message:read promotes own delivered message to read", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Simulate a message from current user arriving via socket (gets _status: "delivered")
    act(() => {
      mockSocket._trigger("message:new", {
        ...makeMsg("msg-1"),
        senderId: "current-user-id",
        createdAt: "2026-04-23T10:00:00.000Z",
      });
    });
    expect(result.current.messages[0]?._status).toBe("delivered");

    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.messages[0]?._status).toBe("read");
  });

  it("message:read from self (own userId as readerId) is ignored", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    const sentMsg = { ...makeMsg("srv-1"), senderId: "current-user-id" };
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: sentMsg }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));

    // readerId === our own userId — should be ignored
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "current-user-id",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    // Status should NOT change — we're the reader, not the recipient notifying us
    expect(result.current.messages[0]?._status).toBe("sent");
  });

  it("message:read only affects messages with createdAt <= lastReadAt", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Two messages from current user at different times
    act(() => {
      mockSocket._trigger("message:new", {
        ...makeMsg("msg-1"),
        senderId: "current-user-id",
        createdAt: "2026-04-23T10:00:00.000Z",
      });
      mockSocket._trigger("message:new", {
        ...makeMsg("msg-2", "Later"),
        senderId: "current-user-id",
        createdAt: "2026-04-23T11:00:00.000Z",
      });
    });

    expect(result.current.messages).toHaveLength(2);

    // lastReadAt is between the two messages
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: "2026-04-23T10:30:00.000Z",
        timestamp: new Date().toISOString(),
      });
    });

    // Only msg-1 (before lastReadAt) should be promoted
    expect(result.current.messages[0]?._status).toBe("read");
    // msg-2 (after lastReadAt) should remain delivered
    expect(result.current.messages[1]?._status).toBe("delivered");
  });

  it("status monotonicity: message already read stays read (no backward regression)", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    const sentMsg = { ...makeMsg("srv-1"), senderId: "current-user-id" };
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: sentMsg }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));

    // First read event — promotes to "read"
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });
    expect(result.current.messages[0]?._status).toBe("read");

    // Second read event — should NOT cause any change
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 2000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });
    expect(result.current.messages[0]?._status).toBe("read");
  });

  it("status monotonicity: message:delivered after message:read does not regress to delivered", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    const sentMsg = { ...makeMsg("srv-1"), senderId: "current-user-id" };
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: sentMsg }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));

    // Promote to "read"
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });
    expect(result.current.messages[0]?._status).toBe("read");

    // Late message:delivered arrives — must NOT regress to "delivered"
    act(() => {
      mockSocket._trigger("message:delivered", {
        messageId: "srv-1",
        conversationId: "conv-1",
        deliveredBy: "user-1",
        timestamp: new Date().toISOString(),
      });
    });
    // Status stays "read" — never goes backwards
    expect(result.current.messages[0]?._status).toBe("read");
  });

  it("message:read with non-matching conversationId is filtered out", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));
    const sentMsg = { ...makeMsg("srv-1"), senderId: "current-user-id" };
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ message: sentMsg }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("sent"));

    // message:read for a different conversation
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-999",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    // Status unchanged — wrong conversation
    expect(result.current.messages[0]?._status).toBe("sent");
  });

  it("message:read for message in sending status is not promoted", async () => {
    mockFetch.mockReturnValueOnce(makeSuccessResponse({ messages: [], hasMore: false }));

    const { result } = renderHook(() =>
      usePortalMessages({ applicationId: APP_ID, conversationId: "conv-1" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Start sending but don't resolve the API — message stays "sending"
    let resolveSend!: () => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = () => resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }),
    );

    act(() => {
      void result.current.sendMessage("Hello");
    });
    expect(result.current.messages[0]?._status).toBe("sending");

    // Trigger message:read while still "sending"
    act(() => {
      mockSocket._trigger("message:read", {
        conversationId: "conv-1",
        readerId: "user-1",
        lastReadAt: new Date(Date.now() + 1000).toISOString(),
        timestamp: new Date().toISOString(),
      });
    });

    // Must NOT be promoted — "sending" is ineligible
    expect(result.current.messages[0]?._status).toBe("sending");

    // Cleanup: resolve the pending fetch
    act(() => resolveSend());
    await waitFor(() => expect(result.current.messages[0]?._status).toBe("failed"));
  });
});
