import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChatMessage } from "@/features/chat/types";

const mockChatSocket = {
  connected: true,
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

import { useUnreadCount } from "./use-unread-count";

const CONV_A = "00000000-0000-4000-8000-000000000001";
const CONV_B = "00000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000003";
const MSG_ID = "00000000-0000-4000-8000-000000000004";

const makeMsg = (conversationId: string): ChatMessage => ({
  messageId: MSG_ID,
  conversationId,
  senderId: USER_ID,
  content: "Hello",
  contentType: "text",
  createdAt: new Date().toISOString(),
});

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

describe("useUnreadCount", () => {
  it("starts with zero total unread", () => {
    getSocketHandlers();
    const { result } = renderHook(() => useUnreadCount());
    expect(result.current.totalUnread).toBe(0);
  });

  it("increments total unread on message:new for non-active conversation", () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useUnreadCount(CONV_A));

    act(() => {
      handlers["message:new"]?.[0]?.(makeMsg(CONV_B));
    });

    expect(result.current.totalUnread).toBe(1);
    expect(result.current.unreadCounts[CONV_B]).toBe(1);
  });

  it("does NOT increment for the active conversation", () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useUnreadCount(CONV_A));

    act(() => {
      handlers["message:new"]?.[0]?.(makeMsg(CONV_A));
    });

    expect(result.current.totalUnread).toBe(0);
  });

  it("accumulates counts across multiple conversations", () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useUnreadCount());

    act(() => {
      handlers["message:new"]?.[0]?.(makeMsg(CONV_A));
      handlers["message:new"]?.[0]?.(makeMsg(CONV_A));
      handlers["message:new"]?.[0]?.(makeMsg(CONV_B));
    });

    expect(result.current.totalUnread).toBe(3);
    expect(result.current.unreadCounts[CONV_A]).toBe(2);
    expect(result.current.unreadCounts[CONV_B]).toBe(1);
  });

  it("resets conversation count on markConversationRead", () => {
    const handlers = getSocketHandlers();
    const { result } = renderHook(() => useUnreadCount());

    act(() => {
      handlers["message:new"]?.[0]?.(makeMsg(CONV_A));
      handlers["message:new"]?.[0]?.(makeMsg(CONV_B));
    });
    expect(result.current.totalUnread).toBe(2);

    act(() => {
      result.current.markConversationRead(CONV_A);
    });
    expect(result.current.totalUnread).toBe(1);
    expect(result.current.unreadCounts[CONV_A]).toBeUndefined();
  });

  it("clears active conversation count when activeConversationId changes", () => {
    const handlers = getSocketHandlers();
    // Start without active conversation
    const { result, rerender } = renderHook(
      ({ activeId }: { activeId?: string }) => useUnreadCount(activeId),
      { initialProps: { activeId: undefined as string | undefined } },
    );

    act(() => {
      handlers["message:new"]?.[0]?.(makeMsg(CONV_A));
    });
    expect(result.current.unreadCounts[CONV_A]).toBe(1);

    // Open CONV_A — should reset its count
    rerender({ activeId: CONV_A });
    expect(result.current.unreadCounts[CONV_A]).toBeUndefined();
  });
});
