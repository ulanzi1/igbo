// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { NotificationItem } from "./NotificationItem";
import type { PlatformNotification } from "@/db/schema/platform-notifications";

const mockPush = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
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

const BASE_NOTIFICATION: PlatformNotification = {
  id: "notif-1",
  userId: "user-1",
  type: "system",
  title: "Test notification",
  body: "This is the notification body",
  link: "/some/link",
  isRead: false,
  createdAt: new Date(Date.now() - 2 * 60_000), // 2 min ago
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationItem", () => {
  it("renders notification title and body", () => {
    render(<NotificationItem notification={BASE_NOTIFICATION} />);

    expect(screen.getByText("Test notification")).toBeInTheDocument();
    expect(screen.getByText("This is the notification body")).toBeInTheDocument();
  });

  it("shows unread indicator when not read", () => {
    render(<NotificationItem notification={{ ...BASE_NOTIFICATION, isRead: false }} />);

    // Should have primary background indicator
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-primary/5");
  });

  it("does not show unread indicator when read", () => {
    render(<NotificationItem notification={{ ...BASE_NOTIFICATION, isRead: true }} />);

    const button = screen.getByRole("button");
    expect(button.className).not.toContain("bg-primary/5");
  });

  it("calls onRead when clicked and not already read", () => {
    const onRead = vi.fn();
    render(<NotificationItem notification={BASE_NOTIFICATION} onRead={onRead} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onRead).toHaveBeenCalledWith("notif-1");
  });

  it("navigates using router.push when notification has link", () => {
    render(<NotificationItem notification={BASE_NOTIFICATION} />);

    fireEvent.click(screen.getByRole("button"));

    expect(mockPush).toHaveBeenCalledWith("/some/link");
  });

  it("does not call onRead when already read", () => {
    const onRead = vi.fn();
    const readNotif = { ...BASE_NOTIFICATION, isRead: true, link: undefined };
    render(<NotificationItem notification={readNotif} onRead={onRead} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onRead).not.toHaveBeenCalled();
  });

  it("displays time ago label", () => {
    render(<NotificationItem notification={BASE_NOTIFICATION} />);
    // Should show some time ago text (mocked t() returns key)
    expect(screen.getByText(/timeAgo\./)).toBeInTheDocument();
  });

  it("renders as accessible button with aria-label", () => {
    render(<NotificationItem notification={BASE_NOTIFICATION} />);

    const button = screen.getByRole("button", { name: "Test notification" });
    expect(button).toBeInTheDocument();
  });
});
