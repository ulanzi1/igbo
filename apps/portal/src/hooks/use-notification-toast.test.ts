// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockToast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => mockToast(...args) }));

const mockRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Use vi.hoisted so contextState and socketState are available before vi.mock factories run
const contextState = vi.hoisted(() => ({
  unreadCount: 0,
  increment: vi.fn(),
  resetUnreadCount: vi.fn(),
  syncFromServer: vi.fn(),
}));

const socketState = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> } | null;
    },
);

vi.mock("@/providers/SocketProvider", () => ({
  usePortalSocket: () => ({ portalSocket: socketState.current }),
}));

vi.mock("@/providers/notification-count-context", () => {
  const { createContext, useContext } = require("react") as typeof import("react");
  const ctx = createContext(contextState);
  return {
    NotificationCountContext: ctx,
    useNotificationCount: () => useContext(ctx),
  };
});

import { useNotificationToast } from "./use-notification-toast";

function makeSocket() {
  return { on: vi.fn(), off: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  socketState.current = makeSocket();
});

function renderToastHook() {
  return renderHook(() => useNotificationToast());
}

function getNotifHandler(socket: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> }) {
  return socket.on.mock.calls.find((c: unknown[]) => c[0] === "notification:new")?.[1] as
    | ((n: { title: string; body?: string; link?: string }) => void)
    | undefined;
}

describe("useNotificationToast", () => {
  it("registers notification:new and connect listeners on mount", () => {
    renderToastHook();
    const socket = socketState.current!;
    expect(socket.on).toHaveBeenCalledWith("notification:new", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("connect", contextState.syncFromServer);
  });

  it("fires toast with title/body and duration:5000 on notification:new", () => {
    renderToastHook();
    const socket = socketState.current!;
    const handler = getNotifHandler(socket)!;

    act(() => {
      handler({ title: "New application", body: "Alice applied", link: "/admin/applications/a1" });
    });

    expect(mockToast).toHaveBeenCalledWith(
      "New application",
      expect.objectContaining({ description: "Alice applied", duration: 5000 }),
    );
  });

  it("increments unreadCount on each notification:new event", () => {
    renderToastHook();
    const socket = socketState.current!;
    const handler = getNotifHandler(socket)!;

    act(() => {
      handler({ title: "Notif 1" });
      handler({ title: "Notif 2" });
      handler({ title: "Notif 3" });
    });

    expect(contextState.increment).toHaveBeenCalledTimes(3);
  });

  it("includes action with router.push when notification has link", () => {
    renderToastHook();
    const socket = socketState.current!;
    const handler = getNotifHandler(socket)!;

    act(() => {
      handler({ title: "Update", link: "/applications/a1" });
    });

    const opts = mockToast.mock.calls[0]?.[1] as {
      onClick?: () => void;
      action?: { onClick: () => void };
    };
    expect(opts.action).toBeDefined();
    expect(opts.onClick).toBeDefined();
    opts.onClick!();
    expect(mockRouterPush).toHaveBeenCalledWith("/applications/a1");
    mockRouterPush.mockClear();
    opts.action!.onClick();
    expect(mockRouterPush).toHaveBeenCalledWith("/applications/a1");
  });

  it("omits action when notification has no link", () => {
    renderToastHook();
    const socket = socketState.current!;
    const handler = getNotifHandler(socket)!;

    act(() => {
      handler({ title: "Info" });
    });

    const opts = mockToast.mock.calls[0]?.[1] as { onClick?: unknown; action?: unknown };
    expect(opts.action).toBeUndefined();
    expect(opts.onClick).toBeUndefined();
  });

  it("passes same handler reference to off as was passed to on (no listener leak)", () => {
    const { unmount } = renderToastHook();
    const socket = socketState.current!;
    const onRef = socket.on.mock.calls.find((c: unknown[]) => c[0] === "notification:new")?.[1];

    unmount();

    const offRef = socket.off.mock.calls.find((c: unknown[]) => c[0] === "notification:new")?.[1];
    expect(offRef).toBe(onRef);
  });

  it("calls syncFromServer on reconnect (connect event)", () => {
    renderToastHook();
    const socket = socketState.current!;
    const connectHandler = socket.on.mock.calls.find((c: unknown[]) => c[0] === "connect")?.[1] as
      | (() => void)
      | undefined;

    act(() => {
      connectHandler?.();
    });

    expect(contextState.syncFromServer).toHaveBeenCalledTimes(1);
  });

  it("removes connect listener on unmount", () => {
    const { unmount } = renderToastHook();
    const socket = socketState.current!;
    unmount();
    expect(socket.off).toHaveBeenCalledWith("connect", contextState.syncFromServer);
  });

  it("does nothing when portalSocket is null", () => {
    socketState.current = null;
    renderToastHook();
    expect(mockToast).not.toHaveBeenCalled();
    expect(contextState.increment).not.toHaveBeenCalled();
  });
});
