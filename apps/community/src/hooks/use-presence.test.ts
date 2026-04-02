// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSocket = vi.fn();
vi.mock("./use-socket", () => ({
  useSocket: () => mockUseSocket(),
}));

import { usePresence } from "./use-presence";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePresence", () => {
  it("returns empty presence initially when no socket", () => {
    mockUseSocket.mockReturnValue({ notificationsSocket: null });
    const { result } = renderHook(() => usePresence());

    expect(result.current.presence).toEqual({});
    expect(result.current.isOnline("user-1")).toBe(false);
  });

  it("subscribes to presence:update when socket available", () => {
    const mockSocket = { on: vi.fn(), off: vi.fn() };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });

    renderHook(() => usePresence());

    expect(mockSocket.on).toHaveBeenCalledWith("presence:update", expect.any(Function));
  });

  it("updates presence state when presence:update event fires", () => {
    const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers[event] = eventHandlers[event] ?? [];
        eventHandlers[event]!.push(cb);
      }),
      off: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });

    const { result } = renderHook(() => usePresence());

    act(() => {
      eventHandlers["presence:update"]![0]?.({ userId: "user-1", online: true });
    });

    expect(result.current.isOnline("user-1")).toBe(true);
    expect(result.current.presence["user-1"]).toBe(true);
  });

  it("marks user offline when presence:update with online=false fires", () => {
    const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers[event] = eventHandlers[event] ?? [];
        eventHandlers[event]!.push(cb);
      }),
      off: vi.fn(),
    };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });

    const { result } = renderHook(() => usePresence());

    act(() => {
      eventHandlers["presence:update"]![0]?.({ userId: "user-1", online: true });
    });
    act(() => {
      eventHandlers["presence:update"]![0]?.({ userId: "user-1", online: false });
    });

    expect(result.current.isOnline("user-1")).toBe(false);
  });

  it("removes listener on unmount", () => {
    const mockSocket = { on: vi.fn(), off: vi.fn() };
    mockUseSocket.mockReturnValue({ notificationsSocket: mockSocket });

    const { unmount } = renderHook(() => usePresence());
    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith("presence:update", expect.any(Function));
  });
});
