// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockUseSearchParams = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/points/PointsSummaryCard", () => ({
  PointsSummaryCard: ({ total }: { total: number }) => (
    <div data-testid="summary-card">total:{total}</div>
  ),
}));

vi.mock("@/components/points/PointsHistoryFilter", () => ({
  PointsHistoryFilter: ({
    activeType,
    onFilterChange,
  }: {
    activeType: string;
    onFilterChange: (v: string) => void;
  }) => (
    <div data-testid="history-filter">
      <span>{activeType || "all"}</span>
      <button onClick={() => onFilterChange("like_received")}>filter</button>
    </div>
  ),
}));

vi.mock("@/components/points/PointsHistoryList", () => ({
  PointsHistoryList: ({ entries, loading }: { entries: unknown[]; loading: boolean }) => (
    <div data-testid="history-list">{loading ? "loading" : `entries:${entries.length}`}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import PointsPage from "./page";

const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(""),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  });
  mockUseSearchParams.mockReturnValue(mockSearchParams);
  mockSearchParams.get.mockReturnValue(null);

  // Default useQuery mock: balance query first call, history query second call
  mockUseQuery.mockImplementation((opts: { queryKey: string[] }) => {
    if (opts.queryKey[0] === "points-balance-page") {
      return {
        data: { balance: 42, summary: { total: 42, thisWeek: 5, thisMonth: 20 } },
        isLoading: false,
      };
    }
    return {
      data: { entries: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
    };
  });
});

describe("PointsPage", () => {
  it("renders summary card with balance data", () => {
    render(<PointsPage />);
    expect(screen.getByTestId("summary-card")).toBeTruthy();
    expect(screen.getByText("total:42")).toBeTruthy();
  });

  it("renders history list", () => {
    render(<PointsPage />);
    expect(screen.getByTestId("history-list")).toBeTruthy();
    expect(screen.getByText("entries:0")).toBeTruthy();
  });

  it("updates URL when filter changes", () => {
    render(<PointsPage />);
    fireEvent.click(screen.getByText("filter"));
    expect(mockReplace).toHaveBeenCalled();
  });

  it("returns null when no session (unauthenticated)", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { container } = render(<PointsPage />);
    expect(container.firstChild).toBeNull();
  });

  it("shows skeleton loading state while session is loading", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<PointsPage />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("shows zero-state CTA when balance is 0", () => {
    mockUseQuery.mockImplementation((opts: { queryKey: string[] }) => {
      if (opts.queryKey[0] === "points-balance-page") {
        return {
          data: { balance: 0, summary: { total: 0, thisWeek: 0, thisMonth: 0 } },
          isLoading: false,
        };
      }
      return {
        data: { entries: [], total: 0, page: 1, limit: 20 },
        isLoading: false,
      };
    });

    render(<PointsPage />);
    expect(screen.getByText("widget.zeroState")).toBeTruthy();
  });
});
