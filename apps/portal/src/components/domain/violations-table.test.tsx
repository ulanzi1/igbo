import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ViolationsTable } from "./violations-table";

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

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const BASE_FLAG = {
  id: "flag-1",
  postingId: "posting-1",
  adminUserId: "admin-1",
  category: "other" as const,
  severity: "high",
  description: "This posting contains discriminatory language targeting applicants.",
  status: "open" as const,
  autoPaused: true,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionAction: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-01"),
  postingTitle: "Software Engineer",
  companyName: "Tech Corp",
  companyId: "company-1",
};

const BASE_PROPS = {
  locale: "en",
  onResolved: vi.fn(),
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
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[]} />);
    expect(screen.getByTestId("violations-empty")).toBeInTheDocument();
  });

  it("renders table when items exist", () => {
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId("violations-table")).toBeInTheDocument();
  });

  it("renders each violation row", () => {
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`violation-row-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows posting title in row", () => {
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />);
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("shows severity badge with correct label", () => {
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`severity-badge-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("shows resolve button for each flag", () => {
    renderWithPortalProviders(<ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />);
    expect(screen.getByTestId(`resolve-btn-${BASE_FLAG.id}`)).toBeInTheDocument();
  });

  it("renders multiple rows", () => {
    const secondFlag = { ...BASE_FLAG, id: "flag-2", postingTitle: "Product Manager" };
    renderWithPortalProviders(
      <ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never, secondFlag as never]} />,
    );
    expect(screen.getByTestId(`violation-row-${BASE_FLAG.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`violation-row-${secondFlag.id}`)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(
      <ViolationsTable {...BASE_PROPS} items={[BASE_FLAG as never]} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
