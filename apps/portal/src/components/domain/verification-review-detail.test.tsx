import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useFormatter: () => ({
    dateTime: (d: Date, _opts?: object) => d.toISOString().slice(0, 10),
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => <button disabled={disabled}>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid="dialog-confirm">
      {children}
    </button>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { VerificationReviewDetail } from "./verification-review-detail";
import type { PortalEmployerVerification } from "@igbo/db/schema/portal-employer-verifications";

const mockVerification = {
  id: "ver-1",
  companyId: "company-1",
  companyName: "ACME Ltd",
  ownerUserName: "John Doe",
  submittedDocuments: [
    {
      fileUploadId: "fu-1",
      objectKey: "portal/verification/user-1/fu-1.pdf",
      originalFilename: "reg.pdf",
    },
  ],
  status: "pending",
  adminNotes: null,
  submittedAt: new Date("2026-04-01"),
  reviewedAt: null,
  reviewedByAdminId: null,
  createdAt: new Date("2026-04-01"),
  history: [],
  openViolationCount: 0,
} as PortalEmployerVerification & {
  history: PortalEmployerVerification[];
  openViolationCount: number;
  companyName: string;
  ownerUserName: string;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerificationReviewDetail", () => {
  it("renders company info", () => {
    render(<VerificationReviewDetail verification={mockVerification} />);
    expect(screen.getByText("ACME Ltd")).toBeTruthy();
    expect(screen.getByText("John Doe")).toBeTruthy();
  });

  it("renders document list", () => {
    render(<VerificationReviewDetail verification={mockVerification} />);
    expect(screen.getByTestId("document-row")).toBeTruthy();
    expect(screen.getByText("reg.pdf")).toBeTruthy();
  });

  it("shows approve and reject buttons for pending status", () => {
    render(<VerificationReviewDetail verification={mockVerification} />);
    expect(screen.getByTestId("approve-btn")).toBeTruthy();
    expect(screen.getByTestId("reject-btn")).toBeTruthy();
  });

  it("hides action buttons for non-pending status", () => {
    render(<VerificationReviewDetail verification={{ ...mockVerification, status: "approved" }} />);
    expect(screen.queryByTestId("action-buttons")).toBeNull();
  });

  it("shows violation count badge when violations exist", () => {
    render(
      <VerificationReviewDetail verification={{ ...mockVerification, openViolationCount: 3 }} />,
    );
    expect(screen.getByText(/verificationOpenViolations/)).toBeTruthy();
  });

  it("calls approve API on confirmation", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<VerificationReviewDetail verification={mockVerification} />);
    fireEvent.click(screen.getByTestId("approve-btn"));
    const confirm = await screen.findByTestId("dialog-confirm");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/admin/verifications/ver-1/approve",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows reject dialog when reject button is clicked", () => {
    render(<VerificationReviewDetail verification={mockVerification} />);
    fireEvent.click(screen.getByTestId("reject-btn"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("shows error when reject reason is too short", async () => {
    render(<VerificationReviewDetail verification={mockVerification} />);
    fireEvent.click(screen.getByTestId("reject-btn"));
    const confirm = screen.getByTestId("dialog-confirm");
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls reject API when reason is valid", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<VerificationReviewDetail verification={mockVerification} />);
    fireEvent.click(screen.getByTestId("reject-btn"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "Insufficient documentation provided for verification." },
    });
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/admin/verifications/ver-1/reject",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<VerificationReviewDetail verification={mockVerification} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
