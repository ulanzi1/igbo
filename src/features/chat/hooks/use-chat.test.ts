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

import { useChat, computeUpdatedReactions } from "./use-chat";

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
  attachments: [],
  reactions: [],
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
    expect(result.current.messages[0]).toMatchObject({ messageId: MSG_ID, content: "Hello!" });
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

  it("normalizes message:new with missing attachments/reactions to empty arrays", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const msgWithoutArrays = {
      messageId: "no-arrays",
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Test",
      contentType: "text" as const,
      createdAt: new Date().toISOString(),
      // No attachments or reactions fields
    };

    act(() => {
      handlers["message:new"]?.[0]?.(msgWithoutArrays);
    });

    expect(result.current.messages[0]?.attachments).toEqual([]);
    expect(result.current.messages[0]?.reactions).toEqual([]);
  });

  it("updates message reactions on reaction:added", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    act(() => {
      handlers["reaction:added"]?.[0]?.({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: "user-b",
        emoji: "👍",
        action: "added",
      });
    });

    expect(result.current.messages[0]?.reactions).toHaveLength(1);
    expect(result.current.messages[0]?.reactions[0]?.emoji).toBe("👍");
  });

  it("removes reaction on reaction:removed", async () => {
    const handlers = getSocketHandlers();
    const msgWithReaction: ChatMessage = {
      ...mockMsg,
      reactions: [{ emoji: "👍", userId: "user-b", createdAt: "2026-01-01T00:00:00Z" }],
    };
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(msgWithReaction);
    });

    expect(result.current.messages[0]?.reactions).toHaveLength(1);

    act(() => {
      handlers["reaction:removed"]?.[0]?.({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: "user-b",
        emoji: "👍",
        action: "removed",
      });
    });

    expect(result.current.messages[0]?.reactions).toHaveLength(0);
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

describe("computeUpdatedReactions", () => {
  it("adds a new reaction", () => {
    const result = computeUpdatedReactions([], {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "👍",
      action: "added",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.emoji).toBe("👍");
    expect(result[0]?.userId).toBe(USER_ID);
  });

  it("does not duplicate an existing reaction on add", () => {
    const existing = [{ emoji: "👍", userId: USER_ID, createdAt: "2026-01-01T00:00:00Z" }];
    const result = computeUpdatedReactions(existing, {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "👍",
      action: "added",
    });
    expect(result).toHaveLength(1);
  });

  it("removes a reaction on removed", () => {
    const existing = [{ emoji: "👍", userId: USER_ID, createdAt: "2026-01-01T00:00:00Z" }];
    const result = computeUpdatedReactions(existing, {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "👍",
      action: "removed",
    });
    expect(result).toHaveLength(0);
  });

  it("only removes matching reaction (emoji + userId)", () => {
    const existing = [
      { emoji: "👍", userId: USER_ID, createdAt: "2026-01-01T00:00:00Z" },
      { emoji: "👍", userId: "other-user", createdAt: "2026-01-01T00:00:00Z" },
    ];
    const result = computeUpdatedReactions(existing, {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "👍",
      action: "removed",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("other-user");
  });
});

describe("useChat editMessage", () => {
  it("emits message:edit and resolves success when server responds with ok:true", async () => {
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:edit" && typeof cb === "function") {
          cb({ ok: true });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const response = await result.current.editMessage(MSG_ID, CONV_ID, "Updated content");

    expect(mockChatSocket.emit).toHaveBeenCalledWith(
      "message:edit",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        content: "Updated content",
      }),
      expect.any(Function),
    );
    expect(response).toEqual({ success: true });
  });

  it("resolves with success:false when server responds with error", async () => {
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:edit" && typeof cb === "function") {
          cb({ error: "Message not found" });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const response = await result.current.editMessage(MSG_ID, CONV_ID, "Updated");

    expect(response).toEqual({ success: false, error: "Message not found" });
  });

  it("sendMessage includes parentMessageId when provided", async () => {
    const PARENT_ID = "00000000-0000-4000-8000-000000000099";
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:send" && typeof cb === "function") {
          cb({ messageId: MSG_ID });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    await result.current.sendMessage({
      conversationId: CONV_ID,
      content: "Reply",
      parentMessageId: PARENT_ID,
    });

    expect(mockChatSocket.emit).toHaveBeenCalledWith(
      "message:send",
      expect.objectContaining({ parentMessageId: PARENT_ID }),
      expect.any(Function),
    );
  });
});

describe("useChat deleteMessage", () => {
  it("emits message:delete and resolves success when server responds with ok:true", async () => {
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:delete" && typeof cb === "function") {
          cb({ ok: true });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const response = await result.current.deleteMessage(MSG_ID, CONV_ID);

    expect(mockChatSocket.emit).toHaveBeenCalledWith(
      "message:delete",
      expect.objectContaining({ messageId: MSG_ID, conversationId: CONV_ID }),
      expect.any(Function),
    );
    expect(response).toEqual({ success: true });
  });

  it("resolves with success:false when server responds with error", async () => {
    mockChatSocket.emit.mockImplementation(
      (event: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (event === "message:delete" && typeof cb === "function") {
          cb({ error: "Cannot delete this message" });
        }
      },
    );

    getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    const response = await result.current.deleteMessage(MSG_ID, CONV_ID);

    expect(response).toEqual({ success: false, error: "Cannot delete this message" });
  });
});

describe("useChat message:edited event", () => {
  it("updates message content when message:edited received", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    const editedAt = new Date().toISOString();
    act(() => {
      handlers["message:edited"]?.[0]?.({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        content: "Edited!",
        editedAt,
      });
    });

    const updatedMsg = result.current.messages.find((m) => m.messageId === MSG_ID);
    expect(updatedMsg?.content).toBe("Edited!");
    expect(updatedMsg?.editedAt).toBe(editedAt);
  });

  it("ignores message:edited for unknown messageId", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    act(() => {
      handlers["message:edited"]?.[0]?.({
        messageId: "unknown-msg",
        conversationId: CONV_ID,
        content: "Edited!",
        editedAt: new Date().toISOString(),
      });
    });

    // Original message unchanged
    expect(result.current.messages[0]?.content).toBe("Hello!");
  });
});

describe("useChat message:deleted event", () => {
  it("marks message as deleted when message:deleted received", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    const timestamp = new Date().toISOString();
    act(() => {
      handlers["message:deleted"]?.[0]?.({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        timestamp,
      });
    });

    const deletedMsg = result.current.messages.find((m) => m.messageId === MSG_ID);
    expect(deletedMsg?.deletedAt).toBe(timestamp);
    expect(deletedMsg?.content).toBe("");
  });

  it("ignores message:deleted for unknown messageId", async () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useChat(CONV_ID));

    act(() => {
      handlers["message:new"]?.[0]?.(mockMsg);
    });

    act(() => {
      handlers["message:deleted"]?.[0]?.({
        messageId: "unknown-msg",
        conversationId: CONV_ID,
        deletedAt: new Date().toISOString(),
      });
    });

    // Original message unchanged
    expect(result.current.messages[0]?.content).toBe("Hello!");
    expect(result.current.messages[0]?.deletedAt).toBeUndefined();
  });
});
