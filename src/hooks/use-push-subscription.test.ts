// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── env mock ────────────────────────────────────────────────────────────────

// Use a valid base64url string so urlBase64ToUint8Array doesn't throw
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "dGVzdC12YXBpZC1rZXktdGhhdC1pcy12YWxpZC1iYXNlNjQ",
  },
}));

import { usePushSubscription } from "./use-push-subscription";

// ─── Helper to set up PushManager mock ───────────────────────────────────────

function makePushManager(existing: PushSubscription | null = null) {
  return {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn(),
  };
}

function makeSubscription(endpoint = "https://push.example.com/sub/abc") {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: vi.fn().mockReturnValue({
      endpoint,
      keys: { p256dh: "p256dhkey", auth: "authkey" },
    }),
  } as unknown as PushSubscription;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: PushManager supported, permission granted
  Object.defineProperty(window, "Notification", {
    writable: true,
    value: { permission: "default" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("usePushSubscription", () => {
  it("sets status to 'unsupported' when PushManager is not in window", async () => {
    const originalPushManager = (window as unknown as { PushManager?: unknown }).PushManager;
    delete (window as unknown as { PushManager?: unknown }).PushManager;

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("unsupported");

    if (originalPushManager) {
      (window as unknown as { PushManager?: unknown }).PushManager = originalPushManager;
    }
  });

  it("sets status to 'denied' when Notification.permission is 'denied'", async () => {
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: { permission: "denied" },
    });
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });

    const mockRegistration = { pushManager: makePushManager() };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("denied");
  });

  it("sets status to 'subscribed' when existing subscription found", async () => {
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: { permission: "granted" },
    });

    const existingSub = makeSubscription();
    const mockRegistration = { pushManager: makePushManager(existingSub) };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("subscribed");
  });

  it("sets status to 'unsubscribed' when no existing subscription", async () => {
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: { permission: "granted" },
    });

    const mockRegistration = { pushManager: makePushManager(null) };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("unsubscribed");
  });

  it("subscribe() transitions to 'subscribed' after successful subscribe", async () => {
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      },
    });

    const newSub = makeSubscription();
    const pushManager = makePushManager(null);
    (pushManager.subscribe as ReturnType<typeof vi.fn>).mockResolvedValue(newSub);
    const mockRegistration = { pushManager };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => usePushSubscription());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.status).toBe("subscribed");
  });

  it("subscribe() rolls back to 'unsubscribed' when server returns error", async () => {
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      },
    });

    const newSub = makeSubscription();
    const pushManager = makePushManager(null);
    (pushManager.subscribe as ReturnType<typeof vi.fn>).mockResolvedValue(newSub);
    const mockRegistration = { pushManager };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => usePushSubscription());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.status).toBe("unsubscribed");
    expect(newSub.unsubscribe).toHaveBeenCalled();
  });

  it("unsubscribe() transitions to 'unsubscribed' after successful unsubscribe", async () => {
    Object.defineProperty(window, "PushManager", { writable: true, value: {} });
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: { permission: "granted" },
    });

    const existingSub = makeSubscription();
    const mockRegistration = { pushManager: makePushManager(existingSub) };
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: { ready: Promise.resolve(mockRegistration) },
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => usePushSubscription());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(result.current.status).toBe("unsubscribed");
  });
});
