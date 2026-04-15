import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { AuditLogTable } from "./audit-log-table";
import type { AuditLogRow } from "@igbo/db/queries/audit-logs";

expect.extend(toHaveNoViolations);

Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams("page=1&pageSize=50");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/en/admin/audit-logs",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@igbo/db/queries/portal-admin-audit-logs", () => ({
  PORTAL_AUDIT_ACTIONS: [
    "portal.posting.approve",
    "portal.posting.reject",
    "portal.posting.request_changes",
    "portal.flag.create",
  ],
}));

const mockLog: AuditLogRow = {
  id: "log-1",
  actorId: "admin-1",
  actorName: "Admin User",
  action: "portal.posting.approve",
  targetUserId: null,
  targetType: "portal_job_posting",
  traceId: null,
  details: { postingId: "p1", companyId: "c1", decision: "approved" },
  createdAt: new Date("2026-04-10T10:00:00Z"),
};

const mockLog2: AuditLogRow = {
  id: "log-2",
  actorId: "admin-2",
  actorName: "Super Admin",
  action: "portal.flag.create",
  targetUserId: null,
  targetType: "portal_admin_flag",
  traceId: null,
  details: { postingId: "p2", category: "misleading" },
  createdAt: new Date("2026-04-11T10:00:00Z"),
};

const admins = [
  { id: "admin-1", name: "Admin User" },
  { id: "admin-2", name: "Super Admin" },
];

// Mock fetch for client-side data refetch
const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockResolvedValue({
    json: () =>
      Promise.resolve({
        data: { logs: [mockLog, mockLog2], total: 2, page: 1, limit: 50, totalPages: 1 },
      }),
  } as Response);
});

describe("AuditLogTable", () => {
  it("renders table with log rows", async () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog, mockLog2]} initialTotal={2} admins={admins} />,
    );

    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });

  it("displays translated action labels (not raw action strings)", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    // Should show translated label, not raw "portal.posting.approve"
    expect(screen.getByText("Posting approved")).toBeInTheDocument();
    expect(screen.queryByText("portal.posting.approve")).not.toBeInTheDocument();
  });

  it("displays translated target type labels", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    expect(screen.getByText("Posting")).toBeInTheDocument();
  });

  it("shows summary text for posting actions", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    expect(screen.getByText("Posting p1")).toBeInTheDocument();
  });

  it("expand/collapse row detail toggles aria-expanded", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    const expandBtn = screen.getByRole("button", { name: /show details/i });
    expect(expandBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(expandBtn);
    expect(expandBtn).toHaveAttribute("aria-expanded", "true");

    // Detail panel should show JSON
    expect(screen.getByText(/"postingId": "p1"/)).toBeInTheDocument();

    await user.click(expandBtn);
    expect(expandBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("displays empty state when no logs", () => {
    renderWithPortalProviders(<AuditLogTable initialLogs={[]} initialTotal={0} admins={admins} />);

    expect(screen.getByText("No audit log entries found")).toBeInTheDocument();
    expect(screen.getByText("No admin actions match the current filters.")).toBeInTheDocument();
  });

  it("pagination renders correct page info", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    expect(screen.getByText(/Page/)).toBeInTheDocument();
  });

  it("previous page button is disabled on page 1", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    const prevBtn = screen.getByRole("button", { name: /previous/i });
    expect(prevBtn).toBeDisabled();
  });

  it("export button link includes current filter params", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    const exportLink = screen.getByRole("link", { name: /export csv/i });
    expect(exportLink).toHaveAttribute(
      "href",
      expect.stringContaining("/api/v1/admin/audit-logs/export"),
    );
  });

  it("clear filters resets to page 1", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    const clearBtn = screen.getByRole("button", { name: /clear filters/i });
    await user.click(clearBtn);

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("page=1"));
  });

  it("does not fetch on initial render (uses server-provided data)", () => {
    renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    // The isInitialMount guard prevents the useEffect from fetching on mount
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes axe accessibility checks", async () => {
    const { container } = renderWithPortalProviders(
      <AuditLogTable initialLogs={[mockLog]} initialTotal={1} admins={admins} />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks for empty state", async () => {
    const { container } = renderWithPortalProviders(
      <AuditLogTable initialLogs={[]} initialTotal={0} admins={admins} />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
