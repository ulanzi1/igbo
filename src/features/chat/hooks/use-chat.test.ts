import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ChatMessage } from "@/features/chat/types";

// ── Socket mock ───────────────────────────────────────────────────────────────
const mockChatSocket = {
  connected: true,
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => ({
    chatSocket: mockChatSocket,
    notificationsSocket: null,
    isConnected: true,
  }),
}));

import { useChat } from "./use-chat";

const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

const mockMsg: ChatMessage = {
  messageId: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Hello!",
  contentType: "text",
  createdAt: new Date().toISOString(),
};

function getSocketHandlers() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  mockChatSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    handlers[event] = handlers[event] ?? [];
    handlers[event]!.push(cb);
  });
  mockChatSocket.off.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (handlers[event]) {
      handlers[event] = handlers[event]!.filter((h) => h !== cb);
    }
  });
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useChat", () => {
  it("emits sync:request on mount when already connected", () => {
    mockChatSocket.connected = true;
    getSocketHandlers();
    renderHook(() => useChat(CONV_ID));
    expect(mockChatSocket.emit).toHaveBeenCalledWith(
      "sync:request",
      expect.objectContaining({ lastReceivedAt: undefined }),
    );
  });

  it("adds message to state when message:new received for active conversation", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(0);
    });

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual(mockMsg);
  });

  it("ignores message:new for other conversations when conversationId is set", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.({ ...mockMsg, conversationId: "other-conv" });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("adds all messages when no conversationId filter", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat());

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("prepends replayed messages from sync:replay", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const replayPayload = {
      messages: [
        {
          ...mockMsg,
          messageId: "replayed-msg",
          createdAt: new Date(Date.now() - 10000).toISOString(),
        },
      ],
      hasMore: false,
    };

    act(() => {
      handlers["sync:replay"]?.[0]?.(replayPayload);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.messageId).toBe("replayed-msg");
  });

  it("does not duplicate messages already in state", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    // Replay same message
    act(() => {
      handlers["sync:replay"]?.[0]?.({ messages: [mockMsg], hasMore: false });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("sendMessage emits message:send via chatSocket", async () => {
    // Use mockImplementation (not once) to handle both sync:request (no cb) and message:send (with cb)
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:send" && typeof cb === "function") {
          cb({ messageId: MSG_ID });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const response = await result.current.sendMessage({
      conversationId: CONV_ID,
      content: "Hello!",
    });

    expect(mockChatSocket.emit).toHaveBeenCalledWith(
      "message:send",
      expect.objectContaining({ conversationId: CONV_ID, content: "Hello!" }),
      expect.any(Function),
    );
    expect(response).toEqual({ messageId: MSG_ID });
  });

  it("clearMessages empties the messages array", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toHaveLength(0);
  });
});
