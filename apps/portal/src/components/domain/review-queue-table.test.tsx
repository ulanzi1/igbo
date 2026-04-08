import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ReviewQueueTable } from "./review-queue-table";
import type { ReviewQueueItem } from "@/services/admin-review-service";

expect.extend(toHaveNoViolations);

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams("page=1&pageSize=20");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/admin",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => "en",
  };
});

const makeItem = (overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
  posting: {
    id: "posting-1",
    companyId: "company-1",
    title: "Software Engineer",
    descriptionHtml: "<p>Great role</p>",
    requirements: null,
    salaryMin: null,
    salaryMax: null,
    salaryCompetitiveOnly: false,
    location: "Lagos",
    employmentType: "full_time",
    status: "pending_review",
    culturalContextJson: null,
    descriptionIgboHtml: null,
    applicationDeadline: null,
    expiresAt: null,
    adminFeedbackComment: null,
    closedOutcome: null,
    closedAt: null,
    archivedAt: null,
    revisionCount: 0,
    viewCount: 0,
    communityPostId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    employerTotalPostings: 3,
  },
  company: {
    id: "company-1",
    ownerUserId: "user-1",
    name: "Tech Corp",
    logoUrl: null,
    description: null,
    industry: "technology",
    companySize: "11-50",
    cultureInfo: null,
    trustBadge: true,
    onboardingCompletedAt: null,
    createdAt: new Date("2025-12-01"),
    updatedAt: new Date("2025-12-01"),
  },
  employerName: "John Doe",
  confidenceIndicator: {
    level: "high",
    verifiedEmployer: true,
    violationCount: 0,
    reportCount: 0,
    engagementLevel: "high",
  },
  isFirstTimeEmployer: false,
  screeningResult: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReviewQueueTable", () => {
  it("renders table with items", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders confidence indicator as green circle for high confidence", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    const indicator = screen.getByRole("img", { name: /high confidence/i });
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("bg-green-500");
  });

  it("renders confidence indicator as amber for medium confidence", () => {
    const item = makeItem({
      confidenceIndicator: {
        level: "medium",
        verifiedEmployer: false,
        violationCount: 0,
        reportCount: 0,
        engagementLevel: "low",
      },
    });
    renderWithPortalProviders(<ReviewQueueTable initialItems={[item]} initialTotal={1} />);

    const indicator = screen.getByRole("img", { name: /medium confidence/i });
    expect(indicator).toHaveClass("bg-amber-500");
  });

  it("renders confidence indicator as red for low confidence", () => {
    const item = makeItem({
      confidenceIndicator: {
        level: "low",
        verifiedEmployer: false,
        violationCount: 2,
        reportCount: 5,
        engagementLevel: "low",
      },
    });
    renderWithPortalProviders(<ReviewQueueTable initialItems={[item]} initialTotal={1} />);

    const indicator = screen.getByRole("img", { name: /low confidence/i });
    expect(indicator).toHaveClass("bg-red-500");
  });

  it("renders first-time employer badge when applicable", () => {
    const item = makeItem({ isFirstTimeEmployer: true });
    renderWithPortalProviders(<ReviewQueueTable initialItems={[item]} initialTotal={1} />);

    expect(screen.getByText(/First-time employer/i)).toBeInTheDocument();
  });

  it("does not render first-time employer badge for repeat employers", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    expect(screen.queryByText(/First-time employer/i)).not.toBeInTheDocument();
  });

  it("renders screening placeholder badge", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    expect(screen.getByText("Not screened")).toBeInTheDocument();
  });

  it("click on row navigates to detail page", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    const row = screen.getByRole("row", { name: /Review Software Engineer/i });
    await user.click(row);

    expect(mockPush).toHaveBeenCalledWith("/en/admin/jobs/posting-1/review");
  });

  it("renders empty state when no items", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[]} initialTotal={0} />);

    expect(screen.getByText("Queue is empty")).toBeInTheDocument();
    expect(screen.getByText(/There are no job postings awaiting review/)).toBeInTheDocument();
  });

  it("renders pagination controls", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={50} />);

    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });

  it("submitted date is formatted via i18n", () => {
    renderWithPortalProviders(<ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />);

    // Jan 1, 2026 should be formatted
    expect(screen.getByText(/Jan 1, 2026/)).toBeInTheDocument();
  });

  it("revision count is displayed", () => {
    const item = makeItem({
      posting: {
        ...makeItem().posting,
        revisionCount: 3,
      },
    });
    renderWithPortalProviders(<ReviewQueueTable initialItems={[item]} initialTotal={1} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("passes accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <ReviewQueueTable initialItems={[makeItem()]} initialTotal={1} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
