// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@/test/test-utils";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseSocketContext = vi.fn();
vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => mockUseSocketContext(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConnectionStatusBanner } from "./ConnectionStatusBanner";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConnectionStatusBanner", () => {
  it("renders nothing when connected (no prior disconnect)", () => {
    mockUseSocketContext.mockReturnValue({ connectionPhase: "connected" });
    const { container } = render(<ConnectionStatusBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing during first 5s of reconnecting (no visual change)", () => {
    mockUseSocketContext.mockReturnValue({ connectionPhase: "reconnecting" });
    const { container } = render(<ConnectionStatusBanner />);
    // Before 5s delay fires, nothing should be visible
    expect(container.firstChild).toBeNull();
  });

  it("shows reconnecting banner after 5s delay", () => {
    mockUseSocketContext.mockReturnValue({ connectionPhase: "reconnecting" });
    render(<ConnectionStatusBanner />);

    // Before 5s — nothing
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Advance 5s — banner appears
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("socketReconnecting")).toBeInTheDocument();
  });

  it("shows connection lost banner with retry button when phase is lost", () => {
    mockUseSocketContext.mockReturnValue({ connectionPhase: "lost" });
    render(<ConnectionStatusBanner />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("socketConnectionLost")).toBeInTheDocument();
    expect(screen.getByText("socketRetry")).toBeInTheDocument();
  });

  it("shows brief reconnected flash when transitioning from lost to connected", () => {
    // Start with lost
    mockUseSocketContext.mockReturnValue({ connectionPhase: "lost" });
    const { rerender } = render(<ConnectionStatusBanner />);

    expect(screen.getByText("socketConnectionLost")).toBeInTheDocument();

    // Transition to connected
    mockUseSocketContext.mockReturnValue({ connectionPhase: "connected" });
    rerender(<ConnectionStatusBanner />);

    // Flush setTimeout(fn, 0) that sets showReconnected
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("socketReconnected")).toBeInTheDocument();
  });

  it("auto-dismisses reconnected flash after 2s", () => {
    // Start with lost
    mockUseSocketContext.mockReturnValue({ connectionPhase: "lost" });
    const { rerender } = render(<ConnectionStatusBanner />);

    // Transition to connected
    mockUseSocketContext.mockReturnValue({ connectionPhase: "connected" });
    rerender(<ConnectionStatusBanner />);

    // Flush setTimeout(fn, 0) that sets showReconnected
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("socketReconnected")).toBeInTheDocument();

    // Advance 2s — flash dismisses
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("socketReconnected")).not.toBeInTheDocument();
  });
});
