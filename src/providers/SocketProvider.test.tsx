// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";

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
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
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
    </div>
  );
}

function makeSocket() {
  return {
    disconnect: mockSocketDisconnect,
    on: mockSocketOn,
    off: mockSocketOff,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIo.mockReturnValue(makeSocket());
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
  });

  it("connects when session becomes authenticated with sessionToken", async () => {
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
});

describe("useSocketContext", () => {
  it("returns default context outside provider", () => {
    function Standalone() {
      const ctx = useSocketContext();
      return <span data-testid="val">{ctx.isConnected ? "yes" : "no"}</span>;
    }

    render(<Standalone />);
    expect(screen.getByTestId("val").textContent).toBe("no");
  });
});
