// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseSocketContext = vi.fn().mockReturnValue({
  notificationsSocket: null,
  chatSocket: null,
  isConnected: false,
});

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => mockUseSocketContext(),
}));

import { useSocket } from "./use-socket";

describe("useSocket", () => {
  it("returns socket context values", () => {
    const { result } = renderHook(() => useSocket());

    expect(result.current.notificationsSocket).toBeNull();
    expect(result.current.chatSocket).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("delegates to useSocketContext", () => {
    const mockSocket = { id: "socket-1" };
    mockUseSocketContext.mockReturnValueOnce({
      notificationsSocket: mockSocket,
      chatSocket: null,
      isConnected: true,
    });

    const { result } = renderHook(() => useSocket());

    expect(result.current.notificationsSocket).toBe(mockSocket);
    expect(result.current.isConnected).toBe(true);
  });
});
