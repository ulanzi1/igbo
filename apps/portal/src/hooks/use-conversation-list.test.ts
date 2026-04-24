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
    data: { user: { id: "user-1" } },
    status: "authenticated",
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useConversationList } from "./use-conversation-list";

const makeConv = (id: string, updatedAt = "2026-04-23T10:00:00.000Z", unreadCount = 0) => ({
  id,
  applicationId: `app-${id}`,
  portalContext: {
    jobId: "job-1",
    companyId: "co-1",
    jobTitle: "Engineer",
    companyName: "ACME",
  },
  otherMember: { id: "other-1", displayName: "Bob", photoUrl: null },
  lastMessage: {
    content: "Hi",
    contentType: "text",
    senderId: "other-1",
    createdAt: updatedAt,
  },
  updatedAt,
  unreadCount,
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

describe("useConversationList", () => {
  it("fetches conversations on mount", async () => {
    const convs = [makeConv("conv-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]?.id).toBe("conv-1");
  });

  it("sets hasMore from API response", async () => {
    mockFetch.mockReturnValue(
      makeSuccessResponse({ conversations: [makeConv("conv-1")], hasMore: true }),
    );

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });

  it("updates lastMessage on message:new from socket", async () => {
    const convs = [makeConv("conv-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      mockSocket._trigger("message:new", {
        conversationId: "conv-1",
        content: "New message!",
        contentType: "text",
        senderId: "user-2",
        createdAt: "2026-04-23T12:00:00.000Z",
      });
    });

    expect(result.current.conversations[0]?.lastMessage?.content).toBe("New message!");
    expect(result.current.conversations[0]?.updatedAt).toBe("2026-04-23T12:00:00.000Z");
  });

  it("ignores message:new for unknown conversationId", async () => {
    const convs = [makeConv("conv-1")];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      mockSocket._trigger("message:new", {
        conversationId: "unknown-conv",
        content: "Ghost",
        contentType: "text",
        senderId: "user-2",
        createdAt: "2026-04-23T12:00:00.000Z",
      });
    });

    // conv-1 lastMessage unchanged
    expect(result.current.conversations[0]?.lastMessage?.content).toBe("Hi");
  });

  it("loadMore appends next page", async () => {
    mockFetch.mockReturnValueOnce(
      makeSuccessResponse({ conversations: [makeConv("conv-1")], hasMore: true }),
    );

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetch.mockReturnValueOnce(
      makeSuccessResponse({ conversations: [makeConv("conv-2")], hasMore: false }),
    );

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations[1]?.id).toBe("conv-2");
    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore is a no-op when hasMore=false", async () => {
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: [], hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.loadMore();
    });

    // Only initial fetch called
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("cleans up socket listener on unmount", async () => {
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: [], hasMore: false }));
    const { unmount } = renderHook(() => useConversationList());
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith("message:new", expect.any(Function));
  });

  it("maps unreadCount from API response", async () => {
    const convs = [makeConv("conv-1", "2026-04-23T10:00:00.000Z", 3)];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.conversations[0]?.unreadCount).toBe(3);
  });

  it("resetConversationUnread zeroes unreadCount for matching conversation", async () => {
    const convs = [makeConv("conv-1", "2026-04-23T10:00:00.000Z", 5)];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.resetConversationUnread("conv-1");
    });

    expect(result.current.conversations[0]?.unreadCount).toBe(0);
  });

  it("resetConversationUnread does not affect other conversations", async () => {
    const convs = [
      makeConv("conv-1", "2026-04-23T10:00:00.000Z", 5),
      makeConv("conv-2", "2026-04-22T10:00:00.000Z", 2),
    ];
    mockFetch.mockReturnValue(makeSuccessResponse({ conversations: convs, hasMore: false }));

    const { result } = renderHook(() => useConversationList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.resetConversationUnread("conv-1");
    });

    expect(result.current.conversations[0]?.unreadCount).toBe(0);
    expect(result.current.conversations[1]?.unreadCount).toBe(2);
  });
});
