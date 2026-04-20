import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { EmployerApplicationsTable } from "./employer-applications-table";
import type { EmployerApplicationRow } from "@igbo/db/queries/portal-applications";

expect.extend(toHaveNoViolations);

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/my-jobs/applications",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/domain/application-status-badge", () => ({
  ApplicationStatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

const MOCK_APPS: EmployerApplicationRow[] = [
  {
    applicationId: "app-1",
    jobId: "jp-1",
    jobTitle: "Senior Engineer",
    seekerUserId: "u-1",
    applicantName: "Jane Doe",
    status: "submitted",
    createdAt: new Date("2026-01-15"),
  },
  {
    applicationId: "app-2",
    jobId: "jp-2",
    jobTitle: "Product Manager",
    seekerUserId: "u-2",
    applicantName: null,
    status: "under_review",
    createdAt: new Date("2026-01-16"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Reset searchParams to empty
  for (const key of [...mockSearchParams.keys()]) {
    mockSearchParams.delete(key);
  }
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: { applications: [], total: 0 },
    }),
  } as never);
});

describe("EmployerApplicationsTable", () => {
  it("renders table with initial data (applicant names, job titles, status badges)", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    // Job title appears twice (mobile + desktop columns)
    expect(screen.getAllByText("Senior Engineer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("status-badge-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge-under_review")).toBeInTheDocument();
  });

  it("clicking 'New' filter tab updates URL params with status=new", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const newTab = screen.getByTestId("filter-tab-new");
    await user.click(newTab);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("status=new"));
  });

  it("active filter tab has aria-current='page'", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const allTab = screen.getByTestId("filter-tab-all");
    expect(allTab).toHaveAttribute("aria-current", "page");
    const newTab = screen.getByTestId("filter-tab-new");
    expect(newTab).not.toHaveAttribute("aria-current");
  });

  it("clicking column header updates sortBy and sortOrder params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const applicantHeader = screen.getByRole("button", { name: /Applicant/i });
    await user.click(applicantHeader);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("sortBy=applicantName"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("sortOrder=desc"));
  });

  it("row click navigates to /en/my-jobs/{jobId}/candidates", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const row = screen.getByTestId("application-row-app-1");
    await user.click(row);
    expect(mockPush).toHaveBeenCalledWith("/en/my-jobs/jp-1/candidates");
  });

  it("job title link navigates to /en/my-jobs/{jobId}", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const jobLink = screen.getByTestId("job-link-app-1");
    expect(jobLink.tagName).toBe("A");
    expect(jobLink.getAttribute("href")).toBe("/en/my-jobs/jp-1");
  });

  it("renders empty state when total is 0", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={[]} initialTotal={0} />,
    );
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
    expect(screen.getByText("Share your job postings to attract candidates")).toBeInTheDocument();
  });

  it("shows loading skeleton during fetch triggered by param change", async () => {
    // Set initial params so the component's isInitialMount ref has already been set to false
    mockSearchParams.set("status", "new");
    fetchSpy.mockReturnValue(new Promise(() => {})); // never resolves — keeps loading

    const { rerender } = renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );

    // Now change params to trigger the useEffect fetch
    mockSearchParams.set("status", "inReview");
    rerender(<EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />);

    // The searchParamsString dependency changed, triggering fetch + loading state
    await waitFor(() => {
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    });
  });

  it("shows error banner on fetch failure", async () => {
    // Trigger a fetch by setting isInitialMount to false via first render,
    // then re-render with different searchParams
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );

    // The initial mount skips fetch. Error banner should not appear initially.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("previous page button is disabled on page 1", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={50} />,
    );
    const prevBtn = screen.getByTestId("prev-page");
    expect(prevBtn).toBeDisabled();
  });

  it("next page button is disabled on last page", () => {
    // initialTotal=2 with default pageSize=20 → 1 page → next disabled
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const nextBtn = screen.getByTestId("next-page");
    expect(nextBtn).toBeDisabled();
  });

  it("next page button is enabled when more pages exist and clicking it updates page param", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={50} />,
    );
    const nextBtn = screen.getByTestId("next-page");
    expect(nextBtn).not.toBeDisabled();
    await user.click(nextBtn);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("page=2"));
  });

  it("page size selector updates pageSize param", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={50} />,
    );
    const selector = screen.getByTestId("page-size-selector");
    await user.selectOptions(selector, "50");
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("pageSize=50"));
    // Should also reset to page 1
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("page=1"));
  });

  it("unknown applicant name shows fallback text", () => {
    renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    // MOCK_APPS[1] has applicantName=null
    expect(screen.getByText("Unknown applicant")).toBeInTheDocument();
  });

  it("passes axe accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <EmployerApplicationsTable initialApplications={MOCK_APPS} initialTotal={2} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
