import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) {
      return Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key);
    }
    return key;
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/features/chat/hooks/use-member-search", () => ({
  useMemberSearch: () => ({ results: [], isSearching: false }),
}));

import { GroupInfoPanel } from "./GroupInfoPanel";

// ── Test data ────────────────────────────────────────────────────────────────

const MEMBERS = [
  { id: "user-1", displayName: "Me (Current User)", photoUrl: null },
  { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
  { id: "user-3", displayName: "Chidi Okeke", photoUrl: "/photos/chidi.jpg" },
];

const defaultProps = {
  conversationId: "conv-1",
  members: MEMBERS,
  memberCount: 3,
  onClose: vi.fn(),
  onLeave: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("GroupInfoPanel", () => {
  it("renders participant list with all members", () => {
    render(<GroupInfoPanel {...defaultProps} />);

    // All 3 member names should appear
    expect(screen.getByText(/Me \(Current User\)/)).toBeDefined();
    expect(screen.getByText(/Ada Okonkwo/)).toBeDefined();
    expect(screen.getByText(/Chidi Okeke/)).toBeDefined();

    // Participant count text
    expect(screen.getByText("group.participantCount")).toBeDefined();
  });

  it('shows "(you)" label for current user using i18n key group.you', () => {
    render(<GroupInfoPanel {...defaultProps} />);

    // The current user (user-1) should have the "(you)" indicator
    // which is rendered as t("group.you") → "group.you" via our mock
    const youLabels = screen.getAllByText("group.you");
    expect(youLabels).toHaveLength(1);

    // The you label should be adjacent to the current user's name
    const currentUserName = screen.getByText(/Me \(Current User\)/);
    const parentElement = currentUserName.closest("span");
    expect(parentElement?.textContent).toContain("group.you");
  });

  it('shows "Add Member" button', () => {
    render(<GroupInfoPanel {...defaultProps} />);

    const addButton = screen.getByText("group.addMember");
    expect(addButton).toBeDefined();
    expect(addButton.tagName).toBe("BUTTON");
  });

  it('shows "Leave Conversation" button', () => {
    render(<GroupInfoPanel {...defaultProps} />);

    const leaveButton = screen.getByText("group.leaveGroup");
    expect(leaveButton).toBeDefined();
    expect(leaveButton.tagName).toBe("BUTTON");
  });

  it("shows leave confirmation when leave button clicked", () => {
    render(<GroupInfoPanel {...defaultProps} />);

    // Initially no confirmation text
    expect(screen.queryByText("group.leaveConfirm")).toBeNull();

    // Click the leave button
    const leaveButton = screen.getByText("group.leaveGroup");
    fireEvent.click(leaveButton);

    // Now confirmation should appear
    expect(screen.getByText("group.leaveConfirm")).toBeDefined();

    // Confirm and cancel buttons should appear
    expect(screen.getByText("group.leave")).toBeDefined();
    expect(screen.getByText("group.cancel")).toBeDefined();
  });

  it('has role="dialog" and aria-label', () => {
    render(<GroupInfoPanel {...defaultProps} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "group.participants");
  });
});
