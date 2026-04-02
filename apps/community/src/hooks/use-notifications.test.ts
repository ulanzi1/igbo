// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSocket = vi.fn();
vi.mock("./use-socket", () => ({
  useSocket: () => mockUseSocket(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Wrapper ────────────────────────────────────────────────────────────────

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

import { useNotifications } from "./use-notifications";

const MOCK_NOTIFICATIONS = [
  {
    id: "notif-1",
    userId: "user-1",
    type: "system",
    title: "Hello",
    body: "World",
    link: null,
    isRead: false,
    createdAt: new Date("2026-01-01"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { notifications: MOCK_NOTIFICATIONS, unreadCount: 1 } }),
  });
});

describe("useNotifications", () => {
  it("returns empty data initially while loading", async () => {
    mockUseSocket.mockReturnValue({ notificationsSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("fetches notifications via REST on mount", async () => {
    mockUseSocket.mockReturnValue({ notificationsSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications");
    expect(result.current.notifications).toEqual(MOCK_NOTIFICATIONS);
    expect(result.current.unreadCount).toBe(1);
  });

  it("subscribes to notification:new socket event", async () => {
    const socketEventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        socketEventHandlers[event] = socketEventHandlers[event] ?? [];
        socketEventHandlers[event]!.push(cb);
      }),
      off: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });
    const { wrapper } = makeWrapper();

    renderHook(() => useNotifications(), { wrapper });

    expect(mockSocket.on).toHaveBeenCalledWith("notification:new", expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith("unread:update", expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith("sync:full_refresh", expect.any(Function));
  });

  it("removes socket listeners on unmount", async () => {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });
    const { wrapper } = makeWrapper();

    const { unmount } = renderHook(() => useNotifications(), { wrapper });
    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith("notification:new", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("unread:update", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("sync:full_refresh", expect.any(Function));
  });

  it("returns error when fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    mockUseSocket.mockReturnValue({ notificationsSocket: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
  });
});
