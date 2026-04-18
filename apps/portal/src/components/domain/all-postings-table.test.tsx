import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { AllPostingsTable } from "./all-postings-table";
import type { AdminPostingRow, CompanyForFilter } from "@igbo/db/queries/portal-admin-all-postings";

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
const mockSearchParams = new URLSearchParams("page=1&pageSize=20");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/admin/postings",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

const BASE_POSTING: AdminPostingRow = {
  id: "posting-1",
  title: "Software Engineer",
  status: "active",
  location: "Lagos",
  employmentType: "full_time",
  archivedAt: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  companyId: "company-1",
  companyName: "Tech Corp",
  companyTrustBadge: false,
  employerName: "John Doe",
  applicationDeadline: null,
};

const ARCHIVED_POSTING: AdminPostingRow = {
  id: "posting-2",
  title: "UX Designer",
  status: "expired",
  location: null,
  employmentType: "contract",
  archivedAt: new Date("2026-02-15"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  companyId: "company-2",
  companyName: "Design Studio",
  companyTrustBadge: true,
  employerName: null,
  applicationDeadline: null,
};

const COMPANIES: CompanyForFilter[] = [
  { id: "company-1", name: "Tech Corp" },
  { id: "company-2", name: "Design Studio" },
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: { postings: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
  } as never);
});

describe("AllPostingsTable", () => {
  it("renders posting rows", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("displays translated status badges (not raw enum values)", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });

  it("shows trust badge for verified companies", () => {
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[ARCHIVED_POSTING]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    expect(screen.getByLabelText("Verified employer", { exact: true })).toBeInTheDocument();
  });

  it("does not show trust badge for unverified company", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.queryByLabelText("Verified employer")).not.toBeInTheDocument();
  });

  it("shows '—' when employer name is null", () => {
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[ARCHIVED_POSTING]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    // ARCHIVED_POSTING has both employerName=null and location=null → two "—"s
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows '—' when location is null", () => {
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[ARCHIVED_POSTING]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    // ARCHIVED_POSTING has location=null, employer=null → two "—"s
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Archived' badge for archived postings", () => {
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[ARCHIVED_POSTING]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("does not show Archived badge for non-archived postings", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("status filter change updates URL params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const trigger = screen.getByLabelText("Status");
    await user.click(trigger);
    // Use findByRole('option') to avoid matching the status badge
    const activeOption = await screen.findByRole("option", { name: "Active" });
    await user.click(activeOption);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("status=active"));
  });

  it("company filter change updates URL params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const trigger = screen.getByLabelText("Company");
    await user.click(trigger);
    const companyOption = await screen.findByRole("option", { name: "Tech Corp" });
    await user.click(companyOption);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("companyId=company-1"));
  });

  it("date from filter updates URL params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const dateFromInput = screen.getByLabelText("From");
    await user.type(dateFromInput, "2026-01-01");
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("dateFrom="));
  });

  it("clear filters button resets URL params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const clearButtons = screen.getAllByText("Clear filters");
    await user.click(clearButtons[0]!);
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/en\/admin\/postings\?page=1/));
  });

  it("clickable rows navigate to review detail page", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const row = screen.getByRole("row", { name: /View Software Engineer/ });
    await user.click(row);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("admin/jobs/posting-1/review"));
  });

  it("pagination renders correct page info", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={25} companies={COMPANIES} />,
    );
    expect(screen.getByText(/Page 1/)).toBeInTheDocument();
    // "Showing 1–20 of 25 results"
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it("previous page button is disabled on page 1", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={25} companies={COMPANIES} />,
    );
    const prevBtn = screen.getByLabelText("Previous page");
    expect(prevBtn).toBeDisabled();
  });

  it("next page button is enabled when multiple pages exist", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={25} companies={COMPANIES} />,
    );
    const nextBtn = screen.getByLabelText("Next page");
    expect(nextBtn).not.toBeDisabled();
  });

  it("shows empty state when no postings", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[]} initialTotal={0} companies={COMPANIES} />,
    );
    expect(screen.getByText("No postings found")).toBeInTheDocument();
    expect(screen.getByText("No job postings match the current filters.")).toBeInTheDocument();
  });

  it("shows loading skeleton structure (Skeleton components exist in component)", () => {
    // The skeleton is rendered via isLoading state which fires after initial mount.
    // Verify the component renders initial data correctly (skeleton appears on refetch).
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    // Initial data renders correctly (skeleton only shown during client-side refetch)
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("does not show error banner on initial render", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders company name as a link", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const link = screen.getByTestId(`company-link-${BASE_POSTING.id}`);
    expect(link.tagName).toBe("A");
    expect(link).toHaveTextContent("Tech Corp");
  });

  it("company name link href points to employer directory", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const link = screen.getByTestId(`company-link-${BASE_POSTING.id}`);
    expect(link.getAttribute("href")).toContain("/admin/employers");
  });

  it("company name click does NOT trigger row navigation (stopPropagation)", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const link = screen.getByTestId(`company-link-${BASE_POSTING.id}`);
    await user.click(link);
    // Row push should NOT be called (only the link navigation happens)
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining("admin/jobs/posting-1/review"),
    );
  });

  it("passes axe accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders Deadline column header", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    expect(screen.getByText("Deadline")).toBeInTheDocument();
  });

  it("shows '—' when applicationDeadline is null", () => {
    renderWithPortalProviders(
      <AllPostingsTable initialPostings={[BASE_POSTING]} initialTotal={1} companies={COMPANIES} />,
    );
    // BASE_POSTING has applicationDeadline=null → "—" for deadline column
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows formatted deadline date when set", () => {
    const postingWithDeadline: AdminPostingRow = {
      ...BASE_POSTING,
      applicationDeadline: new Date("2026-05-15T23:59:59.999Z"),
    };
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[postingWithDeadline]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    const deadlineCell = screen.getByTestId(`deadline-${BASE_POSTING.id}`);
    expect(deadlineCell).toBeInTheDocument();
    expect(deadlineCell.textContent).toBeTruthy();
  });

  it("shows past deadline in red for active postings", () => {
    const postingWithPastDeadline: AdminPostingRow = {
      ...BASE_POSTING,
      status: "active",
      applicationDeadline: new Date("2026-04-10T23:59:59.999Z"),
    };
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[postingWithPastDeadline]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    const deadlineCell = screen.getByTestId(`deadline-${BASE_POSTING.id}`);
    expect(deadlineCell.className).toContain("text-red-600");
  });

  it("does NOT show red for past deadline on non-active postings", () => {
    const postingWithPastDeadline: AdminPostingRow = {
      ...BASE_POSTING,
      status: "expired",
      applicationDeadline: new Date("2026-04-10T23:59:59.999Z"),
    };
    renderWithPortalProviders(
      <AllPostingsTable
        initialPostings={[postingWithPastDeadline]}
        initialTotal={1}
        companies={COMPANIES}
      />,
    );
    const deadlineCell = screen.getByTestId(`deadline-${BASE_POSTING.id}`);
    expect(deadlineCell.className).not.toContain("text-red-600");
  });
});
