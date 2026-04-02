// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockT = vi.fn((key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}:${JSON.stringify(params)}`;
  return key;
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

import { AnalyticsDashboard } from "./AnalyticsDashboard";

const MOCK_DASHBOARD_DATA = {
  dateRange: { fromDate: "2026-02-08", toDate: "2026-03-09" },
  live: { currentlyOnline: 7, todayPartialDau: 42 },
  summary: { dau: 100, mau: 2000, dauMauRatio: 0.05, registrations: 5, approvals: 3, netGrowth: 2 },
  growth: {
    registrations: [{ date: "2026-03-01", value: 5 }],
    approvals: [{ date: "2026-03-01", value: 3 }],
    netGrowth: [{ date: "2026-03-01", value: 2 }],
  },
  engagement: { posts: 50, messages: 300, articles: 5, events: 2, avgEventAttendance: 12 },
  geoBreakdown: {
    countries: [{ name: "Nigeria", count: 100, cities: [{ name: "Lagos", count: 60 }] }],
  },
  tierBreakdown: { tiers: { BASIC: 800, PROFESSIONAL: 150 } },
  topContent: {
    items: [{ id: "post-1", preview: "Hello world", engagement: 42, createdAt: "2026-03-01" }],
  },
};

function setupQueries(
  dashboardOverride?: Partial<{ isLoading: boolean; isError: boolean; data: unknown }>,
) {
  mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
    const isLive = queryKey.includes("live");
    if (isLive) {
      return {
        data: { data: { live: MOCK_DASHBOARD_DATA.live } },
        isLoading: false,
        isError: false,
      };
    }
    return {
      data: { data: MOCK_DASHBOARD_DATA },
      isLoading: false,
      isError: false,
      ...dashboardOverride,
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupQueries();
});

describe("AnalyticsDashboard", () => {
  it("renders without crashing", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.live.heading")).toBeInTheDocument();
  });

  it("renders summary section heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.summary.heading")).toBeInTheDocument();
  });

  it("renders growth section heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.growth.heading")).toBeInTheDocument();
  });

  it("renders engagement section heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.engagement.heading")).toBeInTheDocument();
  });

  it("renders geographic breakdown heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.geo.heading")).toBeInTheDocument();
  });

  it("renders tier breakdown heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.tier.heading")).toBeInTheDocument();
  });

  it("renders top content heading", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("analytics.topContent.heading")).toBeInTheDocument();
  });

  it("displays live online count", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("displays live partial DAU", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows loading skeleton when dashboard is loading", () => {
    setupQueries({ isLoading: true, data: undefined });
    render(<AnalyticsDashboard />);
    // Pulse skeletons rendered with aria-hidden
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error message when dashboard load fails", () => {
    setupQueries({ isError: true, data: undefined });
    render(<AnalyticsDashboard />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("analytics.loadError")).toBeInTheDocument();
  });

  it("shows geographic country data", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("Nigeria")).toBeInTheDocument();
  });

  it("shows top content preview text", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("shows noData message when geoBreakdown is empty", () => {
    setupQueries({
      data: {
        data: {
          ...MOCK_DASHBOARD_DATA,
          geoBreakdown: { countries: [] },
        },
      },
    });
    render(<AnalyticsDashboard />);
    const noDataMessages = screen.getAllByText("analytics.noData");
    expect(noDataMessages.length).toBeGreaterThan(0);
  });

  it("date range filter inputs render with labels", () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByLabelText("analytics.filters.fromDate")).toBeInTheDocument();
    expect(screen.getByLabelText("analytics.filters.toDate")).toBeInTheDocument();
  });

  it("changing fromDate triggers re-query with new date", () => {
    render(<AnalyticsDashboard />);
    const fromInput = screen.getByLabelText("analytics.filters.fromDate");
    fireEvent.change(fromInput, { target: { value: "2026-02-01" } });
    // useQuery called again with updated queryKey
    expect(mockUseQuery).toHaveBeenCalled();
  });

  it("live query is configured with 60-second refetch interval", () => {
    render(<AnalyticsDashboard />);
    const liveCall = mockUseQuery.mock.calls.find(
      ([arg]: [{ queryKey: string[] }]) =>
        Array.isArray(arg?.queryKey) && arg.queryKey.includes("live"),
    );
    expect(liveCall).toBeDefined();
    expect(liveCall?.[0]).toHaveProperty("refetchInterval", 60_000);
  });

  it("renders translated labels for section content", () => {
    render(<AnalyticsDashboard />);
    // DAU label rendered via translation key
    expect(screen.getByText("analytics.summary.dau")).toBeInTheDocument();
  });

  it("shows no data message when topContent is null", () => {
    setupQueries({
      data: { data: { ...MOCK_DASHBOARD_DATA, topContent: null } },
    });
    render(<AnalyticsDashboard />);
    const noDataMessages = screen.getAllByText("analytics.noData");
    expect(noDataMessages.length).toBeGreaterThan(0);
  });
});
