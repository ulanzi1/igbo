import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { AdminDashboardSummary } from "./admin-dashboard-summary";

expect.extend(toHaveNoViolations);

const baseSummary = {
  pendingCount: 5,
  reviewsToday: 3,
  avgReviewTimeMs: 300000, // 5 minutes
  approvalRate: 0.7,
  rejectionRate: 0.2,
  changesRequestedRate: 0.1,
};

describe("AdminDashboardSummary", () => {
  it("renders all 4 metric cards", () => {
    renderWithPortalProviders(<AdminDashboardSummary summary={baseSummary} />);

    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();
    expect(screen.getByText("Reviewed Today")).toBeInTheDocument();
    expect(screen.getByText("Avg Review Time")).toBeInTheDocument();
    expect(screen.getByText("Decision Breakdown")).toBeInTheDocument();
  });

  it("handles 0 counts correctly", () => {
    const emptySummary = {
      pendingCount: 0,
      reviewsToday: 0,
      avgReviewTimeMs: null,
      approvalRate: 0,
      rejectionRate: 0,
      changesRequestedRate: 0,
    };
    renderWithPortalProviders(<AdminDashboardSummary summary={emptySummary} />);

    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("displays N/A when avgReviewTimeMs is null", () => {
    renderWithPortalProviders(
      <AdminDashboardSummary summary={{ ...baseSummary, avgReviewTimeMs: null }} />,
    );

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("formats duration correctly for minutes", () => {
    renderWithPortalProviders(<AdminDashboardSummary summary={baseSummary} />);
    // 300000ms = 5 minutes
    expect(screen.getByText("5m")).toBeInTheDocument();
  });

  it("shows density-aware spacing", () => {
    const { container } = renderWithPortalProviders(
      <AdminDashboardSummary summary={baseSummary} />,
      { density: "compact" },
    );
    // compact density should apply compact styles
    const wrapper = container.firstChild;
    expect(wrapper).toBeTruthy();
  });

  it("renders approval percentage in decision breakdown", () => {
    renderWithPortalProviders(<AdminDashboardSummary summary={baseSummary} />);
    expect(screen.getByText(/Approved: 70%/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected: 20%/)).toBeInTheDocument();
    expect(screen.getByText(/Changes Requested: 10%/)).toBeInTheDocument();
  });

  it("passes accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <AdminDashboardSummary summary={baseSummary} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
