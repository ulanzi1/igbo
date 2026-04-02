// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { NotificationList } from "./NotificationList";
import type { PlatformNotification } from "@/db/schema/platform-notifications";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/en",
  Link: vi.fn(),
  redirect: vi.fn(),
}));

const MOCK_NOTIFICATIONS: PlatformNotification[] = [
  {
    id: "notif-1",
    userId: "user-1",
    type: "system",
    title: "First notification",
    body: "First body",
    link: null,
    isRead: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "notif-2",
    userId: "user-1",
    type: "message",
    title: "Second notification",
    body: "Second body",
    link: null,
    isRead: true,
    createdAt: new Date("2026-01-01T00:00:01.000Z"),
  },
];

describe("NotificationList", () => {
  it("renders loading state", () => {
    render(<NotificationList notifications={[]} isLoading={true} />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<NotificationList notifications={[]} error={new Error("Network error")} />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders empty state when no notifications", () => {
    render(<NotificationList notifications={[]} />);
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("emptyDescription")).toBeInTheDocument();
  });

  it("renders notification items", () => {
    render(<NotificationList notifications={MOCK_NOTIFICATIONS} />);
    expect(screen.getByText("First notification")).toBeInTheDocument();
    expect(screen.getByText("Second notification")).toBeInTheDocument();
  });

  it("shows mark-all-read button when there are unread notifications", () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationList notifications={MOCK_NOTIFICATIONS} onMarkAllRead={onMarkAllRead} />);
    expect(screen.getByText("markAllRead")).toBeInTheDocument();
  });

  it("does not show mark-all-read when all notifications are read", () => {
    const allRead = MOCK_NOTIFICATIONS.map((n) => ({ ...n, isRead: true }));
    render(<NotificationList notifications={allRead} onMarkAllRead={vi.fn()} />);
    expect(screen.queryByText("markAllRead")).not.toBeInTheDocument();
  });

  it("calls onMarkAllRead when mark all button clicked", () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationList notifications={MOCK_NOTIFICATIONS} onMarkAllRead={onMarkAllRead} />);
    fireEvent.click(screen.getByText("markAllRead"));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("renders notification list as accessible list", () => {
    render(<NotificationList notifications={MOCK_NOTIFICATIONS} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
