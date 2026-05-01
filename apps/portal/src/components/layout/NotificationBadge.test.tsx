// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "badgeAriaLabel") {
      const count = params?.count ?? 0;
      if (count === 0) return "No unread notifications";
      if (count === 1) return "1 unread notification";
      return `${String(count)} unread notifications`;
    }
    return key;
  },
}));

// Control unreadCount via module-level ref
const countState = { value: 0 };
vi.mock("@/providers/notification-count-context", () => ({
  useNotificationCount: () => ({ unreadCount: countState.value }),
}));

import { NotificationBadge } from "./NotificationBadge";

describe("NotificationBadge", () => {
  it("renders count badge with correct aria-label when unreadCount > 0", () => {
    countState.value = 3;
    render(<NotificationBadge />);
    const badge = screen.getByTestId("notification-badge-count");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
    const wrapper = screen.getByTestId("notification-badge-wrapper");
    expect(wrapper).toHaveAttribute("aria-label", "3 unread notifications");
  });

  it("does not render count badge when unreadCount is 0", () => {
    countState.value = 0;
    render(<NotificationBadge />);
    expect(screen.queryByTestId("notification-badge-count")).not.toBeInTheDocument();
  });

  it("displays 99+ when unreadCount exceeds 99", () => {
    countState.value = 150;
    render(<NotificationBadge />);
    const badge = screen.getByTestId("notification-badge-count");
    expect(badge).toHaveTextContent("99+");
  });
});
