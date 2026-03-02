// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockMutateAsync = vi.fn();
const mockUseChangeMemberTier = vi.fn();

vi.mock("@/features/admin/hooks/use-members", () => ({
  useChangeMemberTier: () => mockUseChangeMemberTier(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { TierChangeDialog } from "./TierChangeDialog";
import type { AdminMember } from "@/features/admin/hooks/use-members";

const member: AdminMember = {
  id: "m1",
  email: "m1@test.com",
  name: "Test Member",
  displayName: "Test Member",
  membershipTier: "BASIC",
  role: "MEMBER",
  accountStatus: "APPROVED",
  createdAt: "2026-02-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseChangeMemberTier.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
});

describe("TierChangeDialog", () => {
  it("renders current tier and radio options when open", () => {
    render(<TierChangeDialog open={true} onOpenChange={vi.fn()} member={member} />);

    expect(screen.getByText("Admin.members.changeTier.title")).toBeInTheDocument();
    // "basic" appears twice (current tier + radio option), so use getAllByText
    expect(screen.getAllByText("Admin.members.tierFilter.basic").length).toBeGreaterThanOrEqual(1);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  it("does not render when open is false", () => {
    render(<TierChangeDialog open={false} onOpenChange={vi.fn()} member={member} />);

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("disables confirm button when selected tier equals current tier", () => {
    render(<TierChangeDialog open={true} onOpenChange={vi.fn()} member={member} />);

    const confirmBtn = screen.getByText("Admin.members.changeTier.confirm");
    expect(confirmBtn).toBeDisabled();
  });

  it("enables confirm button after selecting a different tier", () => {
    render(<TierChangeDialog open={true} onOpenChange={vi.fn()} member={member} />);

    const proRadio = screen.getByDisplayValue("PROFESSIONAL");
    fireEvent.click(proRadio);

    const confirmBtn = screen.getByText("Admin.members.changeTier.confirm");
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls mutateAsync on confirm and shows success", async () => {
    mockMutateAsync.mockResolvedValue({});
    const onOpenChange = vi.fn();
    render(<TierChangeDialog open={true} onOpenChange={onOpenChange} member={member} />);

    fireEvent.click(screen.getByDisplayValue("TOP_TIER"));
    fireEvent.click(screen.getByText("Admin.members.changeTier.confirm"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: "m1", tier: "TOP_TIER" });
    });

    expect(screen.getByText("Admin.members.changeTier.success")).toBeInTheDocument();
  });

  it("shows error message when mutation fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("fail"));
    render(<TierChangeDialog open={true} onOpenChange={vi.fn()} member={member} />);

    fireEvent.click(screen.getByDisplayValue("PROFESSIONAL"));
    fireEvent.click(screen.getByText("Admin.members.changeTier.confirm"));

    await waitFor(() => {
      expect(screen.getByText("Admin.members.changeTier.error")).toBeInTheDocument();
    });
  });

  it("resets state when dialog closes", () => {
    const onOpenChange = vi.fn();
    render(<TierChangeDialog open={true} onOpenChange={onOpenChange} member={member} />);

    fireEvent.click(screen.getByText("Admin.members.changeTier.cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
