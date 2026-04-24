// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ── i18n mock ──────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "unreadBadgeLabel") return `${params?.count ?? "0"} unread messages`;
    return key;
  },
}));

// ── useUnreadMessageCount mock (via context provider) ─────────────────────────
vi.mock("@/providers/unread-message-count-context", () => ({
  useUnreadMessageCount: vi.fn(),
}));

import { UnreadMessageBadge } from "./UnreadMessageBadge";
import { useUnreadMessageCount } from "@/providers/unread-message-count-context";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useUnreadMessageCount).mockReturnValue({
    totalUnread: 0,
    resetConversation: vi.fn(),
  });
});

describe("UnreadMessageBadge", () => {
  it("renders nothing when totalUnread is 0", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 0,
      resetConversation: vi.fn(),
    });
    const { container } = render(<UnreadMessageBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders badge when totalUnread > 0", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 3,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    expect(screen.getByTestId("unread-message-badge")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders '99' (not '99+') when count is exactly 99", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 99,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    expect(screen.getByText("99")).toBeTruthy();
    expect(screen.queryByText("99+")).toBeNull();
  });

  it("renders '99+' when count is 100 (boundary)", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 100,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("renders '99+' when count is greater than 100", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 150,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("aria-label contains the numeric count (not the display string '99+')", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 150,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    const badge = screen.getByTestId("unread-message-badge");
    // aria-label uses the real count (150), not the capped display string "99+"
    expect(badge).toHaveAttribute("aria-label", "150 unread messages");
  });

  it("aria-label uses correct count for normal values", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 5,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    const badge = screen.getByTestId("unread-message-badge");
    expect(badge).toHaveAttribute("aria-label", "5 unread messages");
  });

  it("renders badge for count of 1", () => {
    vi.mocked(useUnreadMessageCount).mockReturnValue({
      totalUnread: 1,
      resetConversation: vi.fn(),
    });
    render(<UnreadMessageBadge />);
    expect(screen.getByText("1")).toBeTruthy();
  });
});
