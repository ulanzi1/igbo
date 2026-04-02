import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import userEvent from "@testing-library/user-event";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockApprove = vi.fn();
const mockRequestInfo = vi.fn();
const mockReject = vi.fn();
const mockUndo = vi.fn();

vi.mock("@/features/admin/hooks/use-approvals", () => ({
  useApproveApplication: () => ({
    mutate: mockApprove,
    isPending: false,
  }),
  useRequestInfo: () => ({
    mutate: mockRequestInfo,
    isPending: false,
  }),
  useRejectApplication: () => ({
    mutate: mockReject,
    isPending: false,
  }),
  useUndoAction: () => ({
    mutate: mockUndo,
    isPending: false,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${ns}.${key}:${JSON.stringify(params)}`;
    }
    return `${ns}.${key}`;
  },
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
  }),
}));

import { ApplicationRow } from "./ApplicationRow";
import type { AuthUser } from "@igbo/db/schema/auth-users";

const mockApplication: AuthUser = {
  id: "app-uuid-1",
  email: "test@example.com",
  emailVerified: null,
  name: "Test User",
  phone: null,
  image: null,
  locationCity: "Lagos",
  locationState: "Lagos State",
  locationCountry: "Nigeria",
  culturalConnection: "I am Igbo and have strong cultural ties through my family and language.",
  reasonForJoining: "I want to connect with other Igbo people worldwide.",
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ApplicationRow", () => {
  it("renders applicant name and email", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("renders location with prefilled badge", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/Lagos/)).toBeInTheDocument();
    expect(screen.getByText(/Admin.approvals.locationPrefilled/)).toBeInTheDocument();
  });

  it("renders status pill as Pending", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Admin.approvals.statusPending")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    expect(screen.getByLabelText("Admin.approvals.approve")).toBeInTheDocument();
    expect(screen.getByLabelText("Admin.approvals.requestInfo")).toBeInTheDocument();
    expect(screen.getByLabelText("Admin.approvals.reject")).toBeInTheDocument();
  });

  it("calls approve mutation when Approve button is clicked", () => {
    const onNext = vi.fn();
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={onNext} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByLabelText("Admin.approvals.approve"));
    expect(mockApprove).toHaveBeenCalledWith("app-uuid-1", expect.any(Object));
  });

  it("calls reject mutation when Reject button is clicked", () => {
    const onNext = vi.fn();
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={onNext} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByLabelText("Admin.approvals.reject"));
    expect(mockReject).toHaveBeenCalledWith({ id: "app-uuid-1" }, expect.any(Object));
  });

  it("shows message input when Request Info is clicked", async () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByLabelText("Admin.approvals.requestInfo"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("fires keyboard shortcut A to approve when row is active", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={true} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    const row = screen.getByRole("row");
    fireEvent.keyDown(row, { key: "a" });
    expect(mockApprove).toHaveBeenCalled();
  });

  it("fires keyboard shortcut R to reject when row is active", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={true} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    const row = screen.getByRole("row");
    fireEvent.keyDown(row, { key: "r" });
    expect(mockReject).toHaveBeenCalled();
  });

  it("fires keyboard shortcut N to advance to next row", () => {
    const onNext = vi.fn();
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={true} onNext={onNext} />
        </tbody>
      </table>,
    );
    const row = screen.getByRole("row");
    fireEvent.keyDown(row, { key: "n" });
    expect(onNext).toHaveBeenCalled();
  });

  it("has aria-keyshortcuts attribute", () => {
    render(
      <table>
        <tbody>
          <ApplicationRow application={mockApplication} isActive={false} onNext={vi.fn()} />
        </tbody>
      </table>,
    );
    const row = screen.getByRole("row");
    expect(row).toHaveAttribute("aria-keyshortcuts", "a r m n");
  });
});
