import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { AllCompaniesTable } from "./all-companies-table";
import type { AdminCompanyRow } from "@igbo/db/queries/portal-admin-all-companies";

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
const mockNavState = { searchParams: new URLSearchParams("page=1&pageSize=20") };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/admin/employers",
  useSearchParams: () => mockNavState.searchParams,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

const BASE_COMPANY: AdminCompanyRow = {
  id: "company-1",
  name: "Tech Corp",
  trustBadge: false,
  ownerName: "John Doe",
  verificationDisplayStatus: "unverified",
  activePostingCount: 3,
  openViolationCount: 0,
  createdAt: new Date("2026-03-01T00:00:00Z"),
};

const VERIFIED_COMPANY: AdminCompanyRow = {
  id: "company-2",
  name: "Design Studio",
  trustBadge: true,
  ownerName: "Jane Smith",
  verificationDisplayStatus: "verified",
  activePostingCount: 5,
  openViolationCount: 2,
  createdAt: new Date("2026-01-15T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNavState.searchParams = new URLSearchParams("page=1&pageSize=20");
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: { companies: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
  } as never);
});

describe("AllCompaniesTable", () => {
  it("renders table with company rows", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("displays verification status badge for unverified company", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    expect(screen.getByText("Unverified")).toBeInTheDocument();
  });

  it("displays verification status badge for verified company", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("displays pending and rejected verification status badges", () => {
    const pendingCompany: AdminCompanyRow = {
      ...BASE_COMPANY,
      id: "c3",
      name: "Pending Co",
      verificationDisplayStatus: "pending",
    };
    const rejectedCompany: AdminCompanyRow = {
      ...BASE_COMPANY,
      id: "c4",
      name: "Rejected Co",
      verificationDisplayStatus: "rejected",
    };
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[pendingCompany, rejectedCompany]} initialTotal={2} />,
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("shows trust badge icon for verified company", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    expect(screen.getByLabelText("Verified employer")).toBeInTheDocument();
  });

  it("does not show trust badge icon for unverified company", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    expect(screen.queryByLabelText("Verified employer")).not.toBeInTheDocument();
  });

  it("open violation count > 0 renders destructive badge", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    // VERIFIED_COMPANY has openViolationCount=2
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("open violation count = 0 renders plain text '0'", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    // BASE_COMPANY has openViolationCount=0 — shown as plain text
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows '—' when owner name is null", () => {
    const noOwner: AdminCompanyRow = { ...BASE_COMPANY, ownerName: null };
    renderWithPortalProviders(<AllCompaniesTable initialCompanies={[noOwner]} initialTotal={1} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("verification filter change updates URL params", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    const trigger = screen.getByLabelText("Verification status");
    await user.click(trigger);
    const verifiedOption = await screen.findByRole("option", { name: "Verified" });
    await user.click(verifiedOption);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("verification=verified"));
  });

  it("clear filters removes all params and navigates to clean URL", async () => {
    const user = userEvent.setup();
    mockNavState.searchParams = new URLSearchParams("page=2&verification=pending");
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    const clearButtons = screen.getAllByText("Clear filters");
    await user.click(clearButtons[0]!);
    expect(mockPush).toHaveBeenCalledWith("/en/admin/employers");
  });

  it("clickable rows navigate to all-postings page filtered by company", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    const row = screen.getByRole("row", { name: /View postings for Tech Corp/ });
    await user.click(row);
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("admin/postings?companyId=company-1"),
    );
  });

  it("pagination renders correct page info", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={25} />,
    );
    expect(screen.getByText(/Page 1/)).toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it("previous page button is disabled on page 1", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={25} />,
    );
    const prevBtn = screen.getByLabelText("Previous page");
    expect(prevBtn).toBeDisabled();
  });

  it("shows empty state when no companies", () => {
    renderWithPortalProviders(<AllCompaniesTable initialCompanies={[]} initialTotal={0} />);
    expect(screen.getByText("No employers found")).toBeInTheDocument();
    expect(screen.getByText("No employers match the current filter.")).toBeInTheDocument();
  });

  it("shows loading skeleton during refetch", async () => {
    // Make fetch hang indefinitely so loading state is observable
    fetchSpy.mockImplementation(() => new Promise(() => {}));
    const { rerender } = renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    // Initial data visible
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    // Change params to trigger useEffect fetch (isInitialMount already false)
    mockNavState.searchParams = new URLSearchParams("page=2&pageSize=20");
    rerender(<AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />);
    // isLoading=true causes skeleton rows, hiding company data
    await waitFor(() => {
      expect(screen.queryByText("Tech Corp")).not.toBeInTheDocument();
    });
  });

  it("shows error banner when fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    const { rerender } = renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    // No error banner initially
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Change params to trigger useEffect fetch (isInitialMount already false)
    mockNavState.searchParams = new URLSearchParams("page=2&pageSize=20");
    rerender(<AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />);
    // Error banner appears after fetch rejects
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load employers");
  });

  it("violation count > 0 renders as a clickable link", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    const link = screen.getByTestId("violation-count-link-company-2");
    expect(link.tagName).toBe("A");
  });

  it("violation count = 0 does not render as a link", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    expect(screen.queryByTestId("violation-count-link-company-1")).not.toBeInTheDocument();
  });

  it("violation count link href includes companyId and violations path", () => {
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    const link = screen.getByTestId("violation-count-link-company-2");
    expect(link.getAttribute("href")).toContain("admin/violations");
    expect(link.getAttribute("href")).toContain("companyId=company-2");
  });

  it("violation count link click does NOT trigger row navigation (stopPropagation)", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[VERIFIED_COMPANY]} initialTotal={1} />,
    );
    const link = screen.getByTestId("violation-count-link-company-2");
    await user.click(link);
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining("admin/postings?companyId=company-2"),
    );
  });

  it("passes axe accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <AllCompaniesTable initialCompanies={[BASE_COMPANY]} initialTotal={1} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
