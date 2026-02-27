import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Socket mock ───────────────────────────────────────────────────────────────
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

// ── Fetch mock ────────────────────────────────────────────────────────────────
const mockConversations = [
  {
    id: "conv-1",
    type: "direct",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    data: { conversations: mockConversations, meta: { cursor: null, hasMore: false } },
  }),
} as Response);

import { useConversations } from "./use-conversations";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

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
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { conversations: mockConversations, meta: { cursor: null, hasMore: false } },
    }),
  });
});

describe("useConversations", () => {
  it("fetches conversations on mount", async () => {
    getSocketHandlers();
    const { result } = renderHook(() => useConversations(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]?.id).toBe("conv-1");
  });

  it("registers message:new socket listener", async () => {
    getSocketHandlers();
    renderHook(() => useConversations(), { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(mockChatSocket.on).toHaveBeenCalledWith("message:new", expect.any(Function));
    });
  });

  it("returns error state on fetch failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    getSocketHandlers();
    const { result } = renderHook(() => useConversations(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
