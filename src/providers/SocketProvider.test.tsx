// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@/test/test-utils";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_REALTIME_URL: "http://localhost:3001",
  },
}));

const mockSocketDisconnect = vi.fn();
const mockIo = vi.fn();

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

import { SocketProvider, useSocketContext } from "./SocketProvider";

function TestConsumer() {
  const ctx = useSocketContext();
  return (
    <div>
      <span data-testid="connected">{ctx.isConnected ? "yes" : "no"}</span>
      <span data-testid="phase">{ctx.connectionPhase}</span>
    </div>
  );
}

type EventCallback = (...args: unknown[]) => void;

function makeSocket() {
  const handlers: Record<string, EventCallback> = {};
  return {
    disconnect: mockSocketDisconnect,
    on: vi.fn((event: string, cb: EventCallback) => {
      handlers[event] = cb;
    }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => {
      handlers[event]?.(...args);
    },
    _handlers: handlers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SocketProvider", () => {
  it("renders children", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(
      <SocketProvider>
        <p>Test content</p>
      </SocketProvider>,
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("does not connect when unauthenticated", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    expect(mockIo).not.toHaveBeenCalled();
  });

  it("provides default context values", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    expect(screen.getByTestId("connected").textContent).toBe("no");
    expect(screen.getByTestId("phase").textContent).toBe("connected");
  });

  it("connects when session becomes authenticated with sessionToken", async () => {
    mockIo.mockReturnValue(makeSocket());

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    // The dynamic import inside useEffect is a floating promise — wait for it to resolve
    await waitFor(() => {
      expect(mockIo).toHaveBeenCalledTimes(2);
    });

    expect(mockIo).toHaveBeenCalledWith(
      "http://localhost:3001/notifications",
      expect.objectContaining({ auth: { token: "tok_abc" } }),
    );
    expect(mockIo).toHaveBeenCalledWith(
      "http://localhost:3001/chat",
      expect.objectContaining({ auth: { token: "tok_abc" } }),
    );
  });

  it("uses Infinity reconnectionAttempts for persistent reconnect", async () => {
    mockIo.mockReturnValue(makeSocket());

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => {
      expect(mockIo).toHaveBeenCalledTimes(2);
    });

    for (const call of mockIo.mock.calls) {
      expect(call[1]).toMatchObject({ reconnectionAttempts: Infinity });
    }
  });

  it("emits sync:request on reconnect with correct payload per namespace", async () => {
    const notifSocket = makeSocket();
    const chatSocket = makeSocket();
    let callCount = 0;

    mockIo.mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/notifications")) return notifSocket;
      return chatSocket;
    });

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(callCount).toBe(2));

    // Simulate receiving messages to set timestamps
    act(() => {
      notifSocket._trigger("notification:new", { timestamp: "2026-03-24T10:00:00.000Z" });
      chatSocket._trigger("message:new", { createdAt: "2026-03-24T10:05:00.000Z" });
    });

    // Connect both (initial connect, wasDisconnected = false — no sync:request)
    act(() => {
      notifSocket._trigger("connect");
      chatSocket._trigger("connect");
    });

    // Disconnect both (starts phase tracking)
    act(() => {
      notifSocket._trigger("disconnect");
      chatSocket._trigger("disconnect");
    });

    // Clear emit tracking before reconnect
    notifSocket.emit.mockClear();
    chatSocket.emit.mockClear();

    // Reconnect notifications
    act(() => {
      notifSocket._trigger("connect");
    });

    expect(notifSocket.emit).toHaveBeenCalledWith("sync:request", {
      lastTimestamp: "2026-03-24T10:00:00.000Z",
    });

    // Reconnect chat
    act(() => {
      chatSocket._trigger("connect");
    });

    expect(chatSocket.emit).toHaveBeenCalledWith("sync:request", {
      lastReceivedAt: "2026-03-24T10:05:00.000Z",
    });
  });

  it("does not emit sync:request on first connect (no prior timestamp)", async () => {
    const notifSocket = makeSocket();
    const chatSocket = makeSocket();
    let callCount = 0;

    mockIo.mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/notifications")) return notifSocket;
      return chatSocket;
    });

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(callCount).toBe(2));

    // First connect (no prior timestamps)
    act(() => {
      notifSocket._trigger("connect");
      chatSocket._trigger("connect");
    });

    // Should not emit sync:request on fresh connect (no timestamp stored yet)
    expect(notifSocket.emit).not.toHaveBeenCalledWith("sync:request", expect.anything());
    expect(chatSocket.emit).not.toHaveBeenCalledWith("sync:request", expect.anything());
  });

  it("transitions connectionPhase to 'reconnecting' after disconnect, then 'lost' after 15s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const notifSocket = makeSocket();
    const chatSocket = makeSocket();
    let callCount = 0;

    mockIo.mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/notifications")) return notifSocket;
      return chatSocket;
    });

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    vi.useRealTimers(); // use real timers to complete the waitFor
    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );
    await waitFor(() => expect(callCount).toBe(2));

    // Switch to fake timers for phase tracking
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Disconnect both
    act(() => {
      notifSocket._trigger("disconnect");
      chatSocket._trigger("disconnect");
    });

    // Advance 6 seconds → should be 'reconnecting'
    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(screen.getByTestId("phase").textContent).toBe("reconnecting");

    // Advance 10 more seconds (total 16s) → should be 'lost'
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByTestId("phase").textContent).toBe("lost");

    vi.useRealTimers();
  });

  it("resets connectionPhase to 'connected' on reconnect", async () => {
    const notifSocket = makeSocket();
    const chatSocket = makeSocket();
    let callCount = 0;

    mockIo.mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/notifications")) return notifSocket;
      return chatSocket;
    });

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, sessionToken: "tok_abc" },
      status: "authenticated",
    });

    render(
      <SocketProvider>
        <TestConsumer />
      </SocketProvider>,
    );

    await waitFor(() => expect(callCount).toBe(2));

    // Switch to fake timers for phase tracking
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Disconnect
    act(() => {
      notifSocket._trigger("disconnect");
      chatSocket._trigger("disconnect");
    });

    // Advance to lost state
    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(screen.getByTestId("phase").textContent).toBe("lost");

    vi.useRealTimers();

    // Reconnect
    act(() => {
      notifSocket._trigger("connect");
    });

    expect(screen.getByTestId("phase").textContent).toBe("connected");
  });
});

describe("useSocketContext", () => {
  it("returns default context outside provider", () => {
    function Standalone() {
      const ctx = useSocketContext();
      return (
        <div>
          <span data-testid="val">{ctx.isConnected ? "yes" : "no"}</span>
          <span data-testid="phase">{ctx.connectionPhase}</span>
        </div>
      );
    }

    render(<Standalone />);
    expect(screen.getByTestId("val").textContent).toBe("no");
    expect(screen.getByTestId("phase").textContent).toBe("connected");
  });
});
