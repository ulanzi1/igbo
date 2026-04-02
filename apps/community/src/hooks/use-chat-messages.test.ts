// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSocket = vi.fn();
vi.mock("./use-socket", () => ({
  useSocket: () => mockUseSocket(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return {
    queryClient: qc,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children),
  };
}

function makeMessages(count: number, conversationId = "conv-1") {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i + 1}`,
    conversationId,
    senderId: "user-1",
    body: `Message ${i + 1}`,
    createdAt: new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`).toISOString(),
  }));
}

function makePage(messages = makeMessages(3), nextCursor: string | null = null) {
  return { items: messages, nextCursor, hasMore: nextCursor !== null };
}

// ─── Import under test ───────────────────────────────────────────────────────

import { useChatMessages } from "./use-chat-messages";

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: makePage() }),
  });
});

describe("useChatMessages — initial fetch", () => {
  it("returns empty messages and isLoading=true on first render", () => {
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("fetches first page on mount with no cursor", async () => {
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetch).toHaveBeenCalledWith("/api/v1/conversations/conv-1/messages?limit=40");
    expect(result.current.messages).toHaveLength(3);
  });

  it("exposes hasNextPage=false when page has no nextCursor", async () => {
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("exposes hasNextPage=true when page has a nextCursor", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: makePage(makeMessages(3), "cursor-abc") }),
    });
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
  });

  it("returns an error when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // messages fallback to empty on error
    expect(result.current.messages).toEqual([]);
  });
});

describe("useChatMessages — fetchNextPage (older messages)", () => {
  it("appends older messages from subsequent pages", async () => {
    const page1 = makePage(
      makeMessages(2).map((m) => ({ ...m, id: `new-${m.id}` })),
      "cursor-1",
    );
    const page2 = makePage(makeMessages(2).map((m) => ({ ...m, id: `old-${m.id}` })));

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: page1 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: page2 }) });

    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(2);

    void act(() => {
      void result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/conversations/conv-1/messages?limit=40&cursor=cursor-1",
    );
  });
});

describe("useChatMessages — real-time push (message:new)", () => {
  it("registers message:new listener on chatSocket", async () => {
    const mockSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();

    renderHook(() => useChatMessages("conv-1"), { wrapper });

    expect(mockSocket.on).toHaveBeenCalledWith("message:new", expect.any(Function));
  });

  it("removes message:new listener on unmount", async () => {
    const mockSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();

    const { unmount } = renderHook(() => useChatMessages("conv-1"), { wrapper });
    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith("message:new", expect.any(Function));
  });

  it("prepends incoming message to the top of the cache", async () => {
    let messageNewHandler: ((msg: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn((event: string, cb: (msg: unknown) => void) => {
        if (event === "message:new") messageNewHandler = cb;
      }),
      off: vi.fn(),
      emit: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(3);

    const newMsg = {
      id: "msg-99",
      conversationId: "conv-1",
      senderId: "user-2",
      body: "New!",
      createdAt: new Date().toISOString(),
    };

    act(() => {
      messageNewHandler?.(newMsg);
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    expect(result.current.messages[0]).toMatchObject({ id: "msg-99" });
  });

  it("ignores messages for a different conversation", async () => {
    let messageNewHandler: ((msg: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn((event: string, cb: (msg: unknown) => void) => {
        if (event === "message:new") messageNewHandler = cb;
      }),
      off: vi.fn(),
      emit: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      messageNewHandler?.({
        id: "msg-other",
        conversationId: "conv-99", // different conversation
        senderId: "user-2",
        body: "Wrong conv",
        createdAt: new Date().toISOString(),
      });
    });

    expect(result.current.messages).toHaveLength(3); // unchanged
  });

  it("deduplicates a message already in cache", async () => {
    let messageNewHandler: ((msg: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn((event: string, cb: (msg: unknown) => void) => {
        if (event === "message:new") messageNewHandler = cb;
      }),
      off: vi.fn(),
      emit: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Push a message whose id already exists in the fetched page
    act(() => {
      messageNewHandler?.({
        id: "msg-1", // already in cache
        conversationId: "conv-1",
        senderId: "user-1",
        body: "Duplicate",
        createdAt: new Date().toISOString(),
      });
    });

    expect(result.current.messages).toHaveLength(3); // no duplication
  });
});

describe("useChatMessages — send with optimistic update", () => {
  it("emits message:send via socket and shows isSending=true", async () => {
    let ackCallback: ((ack: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn((_event: string, _data: unknown, cb: (ack: unknown) => void) => {
        ackCallback = cb; // capture ack callback without calling it
      }),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.sendMessage("Hello!");
    });

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "message:send",
        expect.objectContaining({ conversationId: "conv-1", body: "Hello!" }),
        expect.any(Function),
      ),
    );
    expect(result.current.isSending).toBe(true);

    // Resolve the ack so mutation doesn't hang
    const realMsg = {
      id: "msg-real",
      conversationId: "conv-1",
      senderId: "user-1",
      body: "Hello!",
      createdAt: new Date().toISOString(),
      tempId: expect.any(String),
    };
    act(() => {
      ackCallback?.(realMsg);
    });

    await waitFor(() => expect(result.current.isSending).toBe(false));
  });

  it("adds a temp message optimistically before server ack", async () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(), // ack never called → mutation stays pending
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(3);

    act(() => {
      result.current.sendMessage("Optimistic!");
    });

    // Temp message appears after onMutate runs (async, but fast)
    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    expect(result.current.messages[0]).toMatchObject({
      body: "Optimistic!",
      status: "sending",
    });
  });

  it("replaces temp message with real message on server ack", async () => {
    let ackCallback: ((ack: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn((_event: string, _data: unknown, cb: (ack: unknown) => void) => {
        ackCallback = cb;
      }),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.sendMessage("Replace me");
    });

    // Capture the tempId from the optimistic message (wait for onMutate)
    await waitFor(() => expect(result.current.messages[0]?.id).toMatch(/^temp_/));
    const tempId = result.current.messages[0]!.id;

    const realMsg = {
      id: "msg-server-1",
      conversationId: "conv-1",
      senderId: "user-1",
      body: "Replace me",
      createdAt: new Date().toISOString(),
      tempId,
    };

    act(() => {
      ackCallback?.(realMsg);
    });
    await waitFor(() => expect(result.current.isSending).toBe(false));

    const firstMsg = result.current.messages[0]!;
    expect(firstMsg.id).toBe("msg-server-1");
    expect(firstMsg.status).toBe("sent");
    // No temp message remains
    expect(result.current.messages.some((m) => m.id === tempId)).toBe(false);
  });

  it("rolls back optimistic message on socket error", async () => {
    let ackCallback: ((ack: unknown) => void) | undefined;
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn((_event: string, _data: unknown, cb: (ack: unknown) => void) => {
        ackCallback = cb;
      }),
    };
    mockUseSocket.mockReturnValue({ chatSocket: mockSocket });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(3);

    act(() => {
      result.current.sendMessage("This will fail");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(4)); // optimistic

    // Server responds with error
    act(() => {
      ackCallback?.({ error: "Message rejected" });
    });
    await waitFor(() => expect(result.current.isSending).toBe(false));

    // Rolled back to 3 messages
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.sendError).not.toBeNull();
  });

  it("rejects immediately if socket is not connected", async () => {
    mockUseSocket.mockReturnValue({ chatSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useChatMessages("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.sendMessage("No socket");
    });
    await waitFor(() => expect(result.current.sendError).not.toBeNull());
    expect(result.current.sendError?.message).toBe("Socket not connected");
  });
});
