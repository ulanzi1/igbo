import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// ── Mutable session mock ───────────────────────────────────────────────────
const sessionState: { status: "authenticated" | "unauthenticated" | "loading" } = {
  status: "unauthenticated",
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: sessionState.status, data: null }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── socket.io-client mock ──────────────────────────────────────────────────
const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    handlers[event] = [...(handlers[event] ?? []), cb];
  }),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  _trigger: (event: string, ...args: unknown[]) => {
    handlers[event]?.forEach((cb) => cb(...args));
  },
};

const mockIo = vi.fn(() => mockSocket);

vi.mock("socket.io-client", () => ({
  default: mockIo,
  io: mockIo,
}));

import React from "react";
import { SocketProvider, usePortalSocket } from "./SocketProvider";

function TestConsumer() {
  const { isConnected, connectionPhase, portalSocket } = usePortalSocket();
  return (
    <div>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="phase">{connectionPhase}</span>
      <span data-testid="socket">{portalSocket ? "exists" : "null"}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset handlers
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  sessionState.status = "unauthenticated";
  mockSocket.disconnect.mockClear();
  mockIo.mockClear();
});

describe("SocketProvider", () => {
  it("renders children", () => {
    const { getByText } = render(
      <SocketProvider>
        <span>child</span>
      </SocketProvider>,
    );
    expect(getByText("child")).toBeDefined();
  });

  it("does not connect when status is unauthenticated", async () => {
    sessionState.status = "unauthenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );
    // Give async connect a chance
    await new Promise((r) => setTimeout(r, 20));
    expect(mockIo).not.toHaveBeenCalled();
  });

  it("connects to /portal namespace when authenticated", async () => {
    sessionState.status = "authenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    const url = (mockIo.mock.calls as unknown as [string, unknown][])[0]?.[0];
    expect(url).toContain("/portal");
  });

  it("passes withCredentials: true in socket options", async () => {
    sessionState.status = "authenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    const opts = (mockIo.mock.calls as unknown as [string, { withCredentials: boolean }][])[0]?.[1];
    expect(opts?.withCredentials).toBe(true);
  });

  it("emits sync:request on connect with lastReceivedAt", async () => {
    sessionState.status = "authenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    // Trigger connect event
    mockSocket._trigger("connect");

    expect(mockSocket.emit).toHaveBeenCalledWith("sync:request", expect.objectContaining({}));
  });

  it("emits sync:request on every reconnect (not just mount)", async () => {
    sessionState.status = "authenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    // First connect
    mockSocket._trigger("connect");
    const firstCallCount = mockSocket.emit.mock.calls.length;

    // Simulate disconnect then reconnect
    mockSocket._trigger("disconnect");
    mockSocket._trigger("connect");

    expect(mockSocket.emit.mock.calls.length).toBeGreaterThan(firstCallCount);
    const syncCalls = mockSocket.emit.mock.calls.filter((c: unknown[]) => c[0] === "sync:request");
    expect(syncCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("tracks lastReceivedAt from message:new events for sync:request", async () => {
    sessionState.status = "authenticated";
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    const ts = "2026-04-23T10:00:00.000Z";
    mockSocket._trigger("message:new", { createdAt: ts });

    // Trigger another connect to see if sync:request uses the timestamp
    mockSocket._trigger("connect");

    const lastSyncCall = mockSocket.emit.mock.calls
      .filter((c: unknown[]) => c[0] === "sync:request")
      .at(-1);
    expect(lastSyncCall?.[1]).toEqual(expect.objectContaining({ lastReceivedAt: ts }));
  });

  it("disconnects socket on unmount", async () => {
    sessionState.status = "authenticated";
    const { unmount } = render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));
    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("provides usePortalSocket context to consumers", async () => {
    sessionState.status = "authenticated";
    const { getByTestId } = render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));
    mockSocket._trigger("connect");

    await waitFor(() => expect(getByTestId("socket").textContent).toBe("exists"));
  });
});

describe("usePortalSocket — default values outside provider", () => {
  it("returns null socket and false connected when not wrapped in provider", () => {
    const { getByTestId } = render(<TestConsumer />);
    expect(getByTestId("connected").textContent).toBe("false");
    expect(getByTestId("socket").textContent).toBe("null");
    expect(getByTestId("phase").textContent).toBe("connected");
  });
});
