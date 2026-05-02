// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockToastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: mockToastError }) }));

import { NotificationItem, getNotificationIcon } from "./notification-item";
import type { PortalNotification } from "@igbo/db/queries/portal-notifications";
import {
  BellIcon,
  EyeIcon,
  SendIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  Undo2Icon,
  CheckCircleIcon,
  XCircleIcon,
  EditIcon,
  ClockIcon,
  SearchIcon,
} from "lucide-react";

const NOW = new Date("2026-05-01T12:00:00Z");

function makeNotification(overrides?: Partial<PortalNotification>): PortalNotification {
  return {
    id: "notif-1",
    userId: "user-1",
    eventType: "portal.application.submitted",
    title: "New application",
    body: "A seeker applied to your job",
    link: "/applications/app-1",
    payloadJson: null,
    readAt: null,
    dismissedAt: null,
    idempotencyKey: "key-1",
    createdAt: NOW,
    ...overrides,
  };
}

const defaultProps = {
  onMarkRead: vi.fn().mockResolvedValue(undefined),
  onDismiss: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationItem — read/unread visual state", () => {
  it("applies unread styles when readAt is null", () => {
    const notification = makeNotification({ readAt: null });
    render(<NotificationItem notification={notification} {...defaultProps} />);
    const item = screen.getByTestId("notification-item");
    expect(item).toHaveAttribute("data-unread", "true");
    expect(item.className).toContain("border-primary");
  });

  it("applies read styles when readAt is set", () => {
    const notification = makeNotification({ readAt: new Date("2026-05-01T13:00:00Z") });
    render(<NotificationItem notification={notification} {...defaultProps} />);
    const item = screen.getByTestId("notification-item");
    expect(item).toHaveAttribute("data-unread", "false");
    expect(item.className).toContain("border-transparent");
  });

  it("sets aria-label with unreadNotification prefix for unread notifications", () => {
    const notification = makeNotification({ readAt: null });
    render(<NotificationItem notification={notification} {...defaultProps} />);
    expect(screen.getByTestId("notification-item")).toHaveAttribute(
      "aria-label",
      "unreadNotification: New application",
    );
  });

  it("sets aria-label with readNotification prefix for read notifications", () => {
    const notification = makeNotification({ readAt: new Date("2026-05-01T13:00:00Z") });
    render(<NotificationItem notification={notification} {...defaultProps} />);
    expect(screen.getByTestId("notification-item")).toHaveAttribute(
      "aria-label",
      "readNotification: New application",
    );
  });
});

describe("NotificationItem — content rendering", () => {
  it("renders title and body", () => {
    render(<NotificationItem notification={makeNotification()} {...defaultProps} />);
    expect(screen.getByTestId("notification-title")).toHaveTextContent("New application");
    expect(screen.getByTestId("notification-body")).toHaveTextContent(
      "A seeker applied to your job",
    );
  });

  it("renders relative timestamp for old notifications", () => {
    render(<NotificationItem notification={makeNotification()} {...defaultProps} />);
    const ts = screen.getByTestId("notification-timestamp");
    expect(ts).toBeInTheDocument();
    // formatDistanceToNow returns something like "about 1 year ago"
    expect(ts.textContent).toBeTruthy();
  });

  it("shows justNow for notifications created less than 60 seconds ago", () => {
    const recentDate = new Date(Date.now() - 10_000); // 10 seconds ago
    render(
      <NotificationItem
        notification={makeNotification({ createdAt: recentDate })}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("notification-timestamp")).toHaveTextContent("justNow");
  });

  it("renders notificationRead sr-only text for read notifications", () => {
    render(
      <NotificationItem
        notification={makeNotification({ readAt: new Date() })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText("notificationRead")).toBeInTheDocument();
  });

  it("does not render notificationRead sr-only text for unread notifications", () => {
    render(
      <NotificationItem notification={makeNotification({ readAt: null })} {...defaultProps} />,
    );
    expect(screen.queryByText("notificationRead")).not.toBeInTheDocument();
  });
});

describe("NotificationItem — click interactions", () => {
  it("calls onMarkRead and navigates to link on click", async () => {
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationItem
        notification={makeNotification({ link: "/applications/app-1" })}
        onMarkRead={onMarkRead}
        onDismiss={vi.fn()}
      />,
    );
    const item = screen.getByTestId("notification-item");
    await userEvent.click(item);
    expect(onMarkRead).toHaveBeenCalledWith("notif-1");
    expect(mockRouterPush).toHaveBeenCalledWith("/applications/app-1");
  });

  it("calls onMarkRead but does not navigate when link is null", async () => {
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationItem
        notification={makeNotification({ link: null })}
        onMarkRead={onMarkRead}
        onDismiss={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId("notification-item"));
    expect(onMarkRead).toHaveBeenCalledWith("notif-1");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("shows itemUnavailable toast when navigation throws", async () => {
    mockRouterPush.mockImplementationOnce(() => {
      throw new Error("Navigation error");
    });
    render(
      <NotificationItem
        notification={makeNotification({ link: "/jobs/deleted" })}
        {...defaultProps}
      />,
    );
    await userEvent.click(screen.getByTestId("notification-item"));
    expect(mockToastError).toHaveBeenCalledWith("itemUnavailable");
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationItem
        notification={makeNotification()}
        onMarkRead={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    const dismissBtn = screen.getByTestId("notification-dismiss");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith("notif-1");
  });

  it("fires click handler on Enter keydown", async () => {
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationItem
        notification={makeNotification()}
        onMarkRead={onMarkRead}
        onDismiss={vi.fn()}
      />,
    );
    const item = screen.getByTestId("notification-item");
    item.focus();
    fireEvent.keyDown(item, { key: "Enter" });
    await vi.waitFor(() => expect(onMarkRead).toHaveBeenCalledWith("notif-1"));
  });
});

describe("NotificationItem — icon mapping", () => {
  it.each([
    ["portal.application.submitted", SendIcon, "SendIcon"],
    ["portal.application.viewed", EyeIcon, "EyeIcon"],
    ["portal.application.status_changed", RefreshCwIcon, "RefreshCwIcon"],
    ["portal.application.withdrawn", Undo2Icon, "Undo2Icon"],
    ["portal.message.received", MessageSquareIcon, "MessageSquareIcon"],
    ["portal.job.approved", CheckCircleIcon, "CheckCircleIcon"],
    ["portal.job.rejected", XCircleIcon, "XCircleIcon"],
    ["portal.job.changes_requested", EditIcon, "EditIcon"],
    ["portal.job.expired", ClockIcon, "ClockIcon"],
    ["portal.saved_search.new_results", SearchIcon, "SearchIcon"],
  ] as const)("returns %s for %s", (eventType, expectedIcon, _iconName) => {
    expect(getNotificationIcon(eventType)).toBe(expectedIcon);
  });

  it("returns BellIcon as fallback for unknown eventType", () => {
    expect(getNotificationIcon("unknown.event.type")).toBe(BellIcon);
  });
});
