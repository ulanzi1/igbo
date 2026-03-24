// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@/test/test-utils";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  },
}));

// Mock useQuery to return controlled data without needing QueryClientProvider
const mockQueryData = { current: null as object | null };
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockQueryData.current }),
}));

import { MaintenanceBanner } from "./MaintenanceBanner";

function mockStatus(data: object | null) {
  mockQueryData.current = data;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockQueryData.current = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MaintenanceBanner", () => {
  it("renders nothing when maintenance is not scheduled", () => {
    mockStatus({ enabled: false, scheduledStart: null, expectedDuration: null });

    const { container } = render(<MaintenanceBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when maintenance is active (enabled=true)", () => {
    mockStatus({
      enabled: true,
      scheduledStart: new Date(Date.now() - 10_000).toISOString(),
      expectedDuration: 60,
    });

    const { container } = render(<MaintenanceBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("shows countdown banner when maintenance is scheduled in the future", () => {
    const scheduledStart = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
    mockStatus({ enabled: false, scheduledStart, expectedDuration: 60 });

    render(<MaintenanceBanner />);

    // Flush the initial setTimeout(updateCountdown, 0) and the setInterval(1000)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/maintenanceScheduled/)).toBeInTheDocument();
  });

  it("renders nothing when query returns null (fetch failed)", () => {
    mockStatus(null);

    const { container } = render(<MaintenanceBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when scheduledStart is in the past", () => {
    mockStatus({
      enabled: false,
      scheduledStart: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      expectedDuration: 60,
    });

    const { container } = render(<MaintenanceBanner />);

    // Advance past the initial setTimeout — countdown becomes "imminently" which is filtered out
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(container.firstChild).toBeNull();
  });
});
