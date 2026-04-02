// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

const mockUseNotifications = vi.fn();
vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

const DEFAULT_NOTIFICATIONS = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNotifications.mockReturnValue(DEFAULT_NOTIFICATIONS);
});

import { DashboardGreeting } from "./DashboardGreeting";

describe("DashboardGreeting", () => {
  it("renders the greeting as an h1", () => {
    render(<DashboardGreeting displayName="Chidi" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('greeting.welcome({"name":"Chidi"})');
  });

  it("shows 'no notifications' text when unread count is 0", () => {
    render(<DashboardGreeting displayName="Chidi" />);
    expect(screen.getByText("stats.noNotifications")).toBeInTheDocument();
  });

  it("shows unread count when there are unread notifications", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_NOTIFICATIONS, unreadCount: 5 });
    render(<DashboardGreeting displayName="Chidi" />);
    expect(screen.getByText('stats.notifications({"count":5})')).toBeInTheDocument();
  });

  it("notification count element has aria-live='polite'", () => {
    render(<DashboardGreeting displayName="Chidi" />);
    const liveEl = screen.getByText("stats.noNotifications");
    expect(liveEl).toHaveAttribute("aria-live", "polite");
  });

  it("still renders greeting and avatar when isLoading is true (only notification count skeletonized)", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_NOTIFICATIONS, isLoading: true });
    const { container } = render(<DashboardGreeting displayName="Chidi" />);
    // Greeting h1 is always visible — server-provided data doesn't need loading
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    // Avatar is always visible
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    // Notification count area shows skeleton
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toBeInTheDocument();
    // No notification text visible during loading
    expect(screen.queryByText("stats.noNotifications")).not.toBeInTheDocument();
  });

  it("renders the greeting subtitle", () => {
    render(<DashboardGreeting displayName="Chidi" />);
    expect(screen.getByText("greeting.subtitle")).toBeInTheDocument();
  });

  it("renders avatar with initials fallback", () => {
    render(<DashboardGreeting displayName="Chidi Obi" />);
    // AvatarFallback renders first 2 chars uppercased
    expect(screen.getByText("CH")).toBeInTheDocument();
  });

  it("uses size='lg' avatar (56px)", () => {
    const { container } = render(<DashboardGreeting displayName="Chidi" />);
    const avatarRoot = container.querySelector('[data-slot="avatar"]');
    expect(avatarRoot?.getAttribute("data-size")).toBe("lg");
  });

  it("renders with optional avatarUrl", () => {
    expect(() =>
      render(<DashboardGreeting displayName="Chidi" avatarUrl="https://example.com/pic.jpg" />),
    ).not.toThrow();
  });
});
