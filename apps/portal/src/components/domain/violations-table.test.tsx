import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ViolationsTable } from "./violations-table";
import { adminFlagFactory } from "@/test/factories";

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

expect.extend(toHaveNoViolations);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const BASE_FLAG = {
  ...adminFlagFactory({
    id: "flag-1",
    postingId: "posting-1",
    adminUserId: "admin-1",
    severity: "high",
    description: "This posting contains discriminatory language targeting applicants.",
    autoPaused: true,
    createdAt: new Date("2026-04-01"),
  }),
  postingTitle: "Software Engineer",
  companyName: "Tech Corp",
  companyId: "company-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({}),
  });
});

describe("ViolationsTable", () => {
  it("renders empty state when no items", () => {
    renderWithPortalProviders(<ViolationsTable items={[]} />);
    expect(screen.getByTestId("violations-empty")).toBeInTheDocument();
  });

  it("renders table when items exist", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId("violations-table")).toBeInTheDocument();
  });

  it("renders each violation row", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`violation-row-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows posting title in row", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("shows severity badge with correct label", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`severity-badge-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows resolve button for each flag", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`resolve-btn-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("renders multiple rows", () => {
    const secondFlag = { ...BASE_FLAG, id: "flag-2", postingTitle: "Product Manager" };
    renderWithPortalProviders(
      <ViolationsTable items={[BASE_FLAG as never, secondFlag as never]} />,
    );
    expect(screen.getByTestId(`violation-row-${BASE_FLAG.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`violation-row-${secondFlag.id}`)).toBeInTheDocument();
  });

  it("renders company column header", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("renders company name as clickable link", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    const link = screen.getByTestId(`company-link-${BASE_FLAG.id}`);
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveTextContent("Tech Corp");
  });

  it("company link href points to postings filtered by company", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    const link = screen.getByTestId(`company-link-${BASE_FLAG.id}`);
    expect(link.getAttribute("href")).toContain("companyId=company-1");
    expect(link.getAttribute("href")).toContain("/admin/postings");
  });

  it("company link has descriptive aria-label", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    const link = screen.getByTestId(`company-link-${BASE_FLAG.id}`);
    expect(link.getAttribute("aria-label")).toContain("Tech Corp");
  });

  it("shows company filter indicator when companyFilter prop is set", () => {
    renderWithPortalProviders(
      <ViolationsTable
        items={[BASE_FLAG as never]}
        companyFilter={{ id: "company-1", name: "Tech Corp" }}
        clearFilterHref="/en/admin/violations"
      />,
    );
    const indicator = screen.getByTestId("company-filter-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Tech Corp");
  });

  it("shows clear filter link when clearFilterHref is set", () => {
    renderWithPortalProviders(
      <ViolationsTable
        items={[BASE_FLAG as never]}
        companyFilter={{ id: "company-1", name: "Tech Corp" }}
        clearFilterHref="/en/admin/violations"
      />,
    );
    const clearLink = screen
      .getAllByRole("link")
      .find((el) => el.getAttribute("href") === "/en/admin/violations");
    expect(clearLink).toBeDefined();
  });

  it("does not show filter indicator when companyFilter is not set", () => {
    renderWithPortalProviders(<ViolationsTable items={[BASE_FLAG as never]} />);
    expect(screen.queryByTestId("company-filter-indicator")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(
      <ViolationsTable items={[BASE_FLAG as never]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
