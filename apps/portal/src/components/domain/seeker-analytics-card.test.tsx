// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { SeekerAnalyticsCard, SeekerAnalyticsCardSkeleton } from "./seeker-analytics-card";
import type { SeekerAnalyticsData } from "@/services/seeker-analytics-service";

expect.extend(toHaveNoViolations);

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fullData: SeekerAnalyticsData = {
  profileViews: 12,
  totalApplications: 6,
  statusCounts: {
    active: 3,
    interviews: 2,
    offers: 1,
    rejected: 2,
    withdrawn: 1,
  },
};

const zeroData: SeekerAnalyticsData = {
  profileViews: 0,
  totalApplications: 0,
  statusCounts: {
    active: 0,
    interviews: 0,
    offers: 0,
    rejected: 0,
    withdrawn: 0,
  },
};

const mixedData: SeekerAnalyticsData = {
  profileViews: 5,
  totalApplications: 2,
  statusCounts: {
    active: 2,
    interviews: 0,
    offers: 0,
    rejected: 3,
    withdrawn: 0,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerAnalyticsCard", () => {
  it("renders with full data showing correct counts", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={fullData} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText(/Active: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Interviews: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Offers: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Withdrawn: 1/)).toBeInTheDocument();
  });

  it("renders card title", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={fullData} />);
    expect(screen.getByText("Your Job Search")).toBeInTheDocument();
  });

  it("renders empty state when data is null", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={null} />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText("Apply to jobs to see your stats here")).toBeInTheDocument();
    expect(screen.getByText("Browse Jobs")).toBeInTheDocument();
  });

  it("renders empty state when all values are zero", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={zeroData} />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText("Browse Jobs")).toBeInTheDocument();
  });

  it("empty state Browse Jobs link points to /jobs", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={null} />);
    const link = screen.getByText("Browse Jobs");
    expect(link.closest("a")).toHaveAttribute("href", "/jobs");
  });

  it("renders with mixed zero/nonzero counts", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={mixedData} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/Active: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Interviews: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected: 3/)).toBeInTheDocument();
  });

  it("has aria-label on the card section", () => {
    renderWithPortalProviders(<SeekerAnalyticsCard data={fullData} />);
    expect(
      screen.getByRole("region", { name: "Job search analytics summary" }),
    ).toBeInTheDocument();
  });

  it("passes axe accessibility checks with data", async () => {
    const { container } = renderWithPortalProviders(<SeekerAnalyticsCard data={fullData} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks with empty state", async () => {
    const { container } = renderWithPortalProviders(<SeekerAnalyticsCard data={null} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks with mixed data", async () => {
    const { container } = renderWithPortalProviders(<SeekerAnalyticsCard data={mixedData} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("SeekerAnalyticsCardSkeleton", () => {
  it("renders skeleton elements", () => {
    renderWithPortalProviders(<SeekerAnalyticsCardSkeleton />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("is hidden from screen readers", () => {
    const { container } = renderWithPortalProviders(<SeekerAnalyticsCardSkeleton />);
    const card = container.firstElementChild;
    expect(card).toHaveAttribute("aria-hidden", "true");
  });
});
