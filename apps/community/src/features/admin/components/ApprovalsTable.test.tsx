import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockUseApplications = vi.fn();

vi.mock("@/features/admin/hooks/use-approvals", () => ({
  useApplications: (...args: unknown[]) => mockUseApplications(...args),
  useApproveApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestInfo: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));

import { ApprovalsTable } from "./ApprovalsTable";
import type { AuthUser } from "@/db/schema/auth-users";

const makeApplication = (id: string): AuthUser => ({
  id,
  email: `${id}@example.com`,
  emailVerified: null,
  name: `User ${id}`,
  phone: null,
  image: null,
  locationCity: "Lagos",
  locationState: null,
  locationCountry: "Nigeria",
  culturalConnection: "Strong cultural connection to Igbo heritage and language.",
  reasonForJoining: "Connect with community.",
  referralName: null,
  consentGivenAt: new Date("2026-02-01"),
  consentIp: null,
  consentVersion: null,
  accountStatus: "PENDING_APPROVAL",
  passwordHash: null,
  role: "MEMBER",
  membershipTier: "BASIC",
  languagePreference: "en",
  adminNotes: null,
  deletedAt: null,
  createdAt: new Date("2026-02-01"),
  updatedAt: new Date("2026-02-01"),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ApprovalsTable", () => {
  it("shows loading state", () => {
    mockUseApplications.mockReturnValue({ isPending: true, isError: false, data: undefined });
    render(<ApprovalsTable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Admin.approvals.loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseApplications.mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<ApprovalsTable />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows empty state when no applications", () => {
    mockUseApplications.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
    });
    render(<ApprovalsTable />);
    expect(screen.getByText("Admin.approvals.empty")).toBeInTheDocument();
  });

  it("renders table with application rows", () => {
    const apps = [makeApplication("app-1"), makeApplication("app-2")];
    mockUseApplications.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: apps, meta: { page: 1, pageSize: 20, total: 2 } },
    });
    render(<ApprovalsTable />);
    expect(screen.getByText("User app-1")).toBeInTheDocument();
    expect(screen.getByText("User app-2")).toBeInTheDocument();
  });
});
