// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useNotifications } from "./use-notifications";

const USER_ID = "user-1";
const NOTIF = {
  id: "n-1",
  userId: USER_ID,
  eventType: "portal.application.submitted",
  title: "Test",
  body: "Body",
  link: null,
  readAt: null,
  createdAt: new Date("2026-05-01T12:00:00Z").toISOString(),
};

function makeOkResponse(data: unknown, meta: { nextCursor: string | null } = { nextCursor: null }) {
  return {
    ok: true,
    json: async () => ({ data, meta }),
  } as unknown as Response;
}

function makeErrorResponse() {
  return { ok: false, status: 500 } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useNotifications — initial fetch", () => {
  it("fetches notifications on mount and sets state", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([NOTIF]));

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]!.id).toBe("n-1");
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error state when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse());

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.notifications).toHaveLength(0);
  });

  it("sets hasMore=true when 20 items returned", async () => {
    const notifs = Array.from({ length: 20 }, (_, i) => ({ ...NOTIF, id: `n-${i}` }));
    mockFetch.mockResolvedValueOnce(makeOkResponse(notifs, { nextCursor: "cursor-abc" }));

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });
});

describe("useNotifications — markAsRead", () => {
  it("optimistically marks notification as read", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([NOTIF]));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as unknown as Response);

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications[0]!.readAt).toBeNull();

    await act(async () => {
      await result.current.markAsRead("n-1");
    });

    expect(result.current.notifications[0]!.readAt).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications/n-1/read", { method: "PATCH" });
  });
});

describe("useNotifications — dismiss", () => {
  it("optimistically removes notification from list", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([NOTIF]));
    mockFetch.mockResolvedValueOnce({ ok: true } as unknown as Response);

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);

    await act(async () => {
      await result.current.dismiss("n-1");
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications/n-1", { method: "DELETE" });
  });
});

describe("useNotifications — loadMore", () => {
  it("appends next page to notifications list", async () => {
    const firstPage = [{ ...NOTIF, id: "n-1" }];
    const secondPage = [{ ...NOTIF, id: "n-2" }];

    mockFetch.mockResolvedValueOnce(makeOkResponse(firstPage, { nextCursor: "cursor-1" }));
    mockFetch.mockResolvedValueOnce(makeOkResponse(secondPage));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(result.current.notifications[1]!.id).toBe("n-2");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications?cursor=cursor-1");
  });
});

describe("useNotifications — error revert", () => {
  it("reverts markAsRead optimistic update on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([NOTIF]));
    mockFetch.mockResolvedValueOnce(makeErrorResponse());

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications[0]!.readAt).toBeNull();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.markAsRead("n-1");
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.notifications[0]!.readAt).toBeNull());
  });

  it("reverts markAllAsRead optimistic update on HTTP error", async () => {
    const notifs = [
      { ...NOTIF, id: "n-1", readAt: null },
      { ...NOTIF, id: "n-2", readAt: null },
    ];
    mockFetch.mockResolvedValueOnce(makeOkResponse(notifs));
    mockFetch.mockResolvedValueOnce(makeErrorResponse());

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.markAllAsRead();
    });

    expect(ok).toBe(false);
    await waitFor(() =>
      expect(result.current.notifications.every((n) => n.readAt === null)).toBe(true),
    );
  });

  it("reverts dismiss optimistic update on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([NOTIF]));
    mockFetch.mockResolvedValueOnce(makeErrorResponse());

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.dismiss("n-1");
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });
});

describe("useNotifications — markAllAsRead", () => {
  it("optimistically marks all unread notifications as read", async () => {
    const notifs = [
      { ...NOTIF, id: "n-1", readAt: null },
      { ...NOTIF, id: "n-2", readAt: null },
    ];
    mockFetch.mockResolvedValueOnce(makeOkResponse(notifs));
    mockFetch.mockResolvedValueOnce({ ok: true } as unknown as Response);

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    const allRead = result.current.notifications.every((n) => n.readAt !== null);
    expect(allRead).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/notifications/mark-all-read", {
      method: "POST",
    });
  });
});
