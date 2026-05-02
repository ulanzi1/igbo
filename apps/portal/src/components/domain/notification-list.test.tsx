// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: mockToast }));

// Use vi.hoisted so state objects are available before vi.mock factories run
const notifState = vi.hoisted(() => ({
  notifications: [] as Array<{
    id: string;
    eventType: string;
    title: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
    link: string | null;
  }>,
  isLoading: false,
  hasMore: false,
  error: null as string | null,
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  dismiss: vi.fn(),
  loadMore: vi.fn(),
}));

const contextState = vi.hoisted(() => ({
  unreadCount: 5,
  increment: vi.fn(),
  decrement: vi.fn(),
  resetUnreadCount: vi.fn(),
  syncFromServer: vi.fn(),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => notifState,
}));

vi.mock("@/providers/notification-count-context", () => ({
  useNotificationCount: () => contextState,
}));

// Mock NotificationItem to avoid deep dependency chain
vi.mock("./notification-item", () => ({
  NotificationItem: ({
    notification,
    onMarkRead,
    onDismiss,
  }: {
    notification: { id: string; title: string };
    onMarkRead: (id: string) => Promise<void>;
    onDismiss: (id: string) => Promise<void>;
  }) => (
    <div data-testid="notification-item" data-id={notification.id}>
      <span>{notification.title}</span>
      <button
        onClick={() => void onMarkRead(notification.id)}
        data-testid={`mark-read-${notification.id}`}
      >
        mark
      </button>
      <button
        onClick={() => void onDismiss(notification.id)}
        data-testid={`dismiss-${notification.id}`}
      >
        dismiss
      </button>
    </div>
  ),
}));

// IntersectionObserver mock
let capturedObserverCallback: IntersectionObserverCallback | null = null;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    capturedObserverCallback = cb;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

import { NotificationList } from "./notification-list";

function makeNotification(id: string, readAt: Date | null = null) {
  return {
    id,
    eventType: "portal.application.submitted",
    title: `Notification ${id}`,
    body: "Body text",
    readAt,
    createdAt: new Date("2026-05-01T12:00:00Z"),
    link: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  notifState.notifications = [];
  notifState.isLoading = false;
  notifState.hasMore = false;
  notifState.error = null;
  notifState.markAsRead.mockResolvedValue(true);
  notifState.markAllAsRead.mockResolvedValue(true);
  notifState.dismiss.mockResolvedValue(true);
  notifState.loadMore.mockResolvedValue(undefined);
  contextState.resetUnreadCount.mockClear();
  contextState.decrement.mockClear();
  capturedObserverCallback = null;
  mockObserve.mockClear();
  mockDisconnect.mockClear();
});

describe("NotificationList — empty state", () => {
  it("shows empty state when no notifications and not loading", () => {
    notifState.notifications = [];
    notifState.isLoading = false;
    render(<NotificationList />);
    expect(screen.getByTestId("notification-empty-state")).toBeInTheDocument();
    expect(screen.getByText("noNotifications")).toBeInTheDocument();
    expect(screen.getByText("noNotificationsDescription")).toBeInTheDocument();
  });

  it("does not show empty state while loading", () => {
    notifState.isLoading = true;
    render(<NotificationList />);
    expect(screen.queryByTestId("notification-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("notification-skeleton")).toBeInTheDocument();
  });
});

describe("NotificationList — loading skeleton", () => {
  it("shows skeleton when isLoading=true and no notifications", () => {
    notifState.isLoading = true;
    notifState.notifications = [];
    render(<NotificationList />);
    expect(screen.getByTestId("notification-skeleton")).toBeInTheDocument();
  });

  it("does not show skeleton when notifications are present", () => {
    notifState.notifications = [makeNotification("1")];
    notifState.isLoading = false;
    render(<NotificationList />);
    expect(screen.queryByTestId("notification-skeleton")).not.toBeInTheDocument();
  });
});

describe("NotificationList — notification rendering", () => {
  it("renders all notification items", () => {
    notifState.notifications = [
      makeNotification("1"),
      makeNotification("2"),
      makeNotification("3"),
    ];
    render(<NotificationList />);
    const items = screen.getAllByTestId("notification-item");
    expect(items).toHaveLength(3);
    expect(screen.getByText("Notification 1")).toBeInTheDocument();
  });

  it("shows list with correct title heading", () => {
    notifState.notifications = [makeNotification("1")];
    render(<NotificationList />);
    expect(screen.getByTestId("notification-center-title")).toHaveTextContent("title");
  });
});

describe("NotificationList — mark all read", () => {
  it("shows mark-all-read button when notifications exist", () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    expect(screen.getByTestId("mark-all-read-button")).toBeInTheDocument();
  });

  it("disables mark-all-read button when all notifications are read", () => {
    notifState.notifications = [
      makeNotification("1", new Date()),
      makeNotification("2", new Date()),
    ];
    render(<NotificationList />);
    const btn = screen.getByTestId("mark-all-read-button");
    expect(btn).toBeDisabled();
  });

  it("enables mark-all-read button when there are unread notifications", () => {
    notifState.notifications = [makeNotification("1", null), makeNotification("2", new Date())];
    render(<NotificationList />);
    const btn = screen.getByTestId("mark-all-read-button");
    expect(btn).not.toBeDisabled();
  });

  it("calls markAllAsRead and resetUnreadCount when button is clicked", async () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    const btn = screen.getByTestId("mark-all-read-button");
    await userEvent.click(btn);
    await waitFor(() => {
      expect(notifState.markAllAsRead).toHaveBeenCalledOnce();
      expect(contextState.resetUnreadCount).toHaveBeenCalledOnce();
    });
  });
});

describe("NotificationList — infinite scroll", () => {
  it("calls loadMore when sentinel becomes visible and hasMore=true", () => {
    notifState.notifications = [makeNotification("1")];
    notifState.hasMore = true;
    notifState.isLoading = false;
    render(<NotificationList />);

    // Simulate intersection
    capturedObserverCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(notifState.loadMore).toHaveBeenCalledOnce();
  });

  it("does NOT call loadMore when hasMore=false", () => {
    notifState.notifications = [makeNotification("1")];
    notifState.hasMore = false;
    render(<NotificationList />);

    capturedObserverCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(notifState.loadMore).not.toHaveBeenCalled();
  });
});

describe("NotificationList — toast feedback", () => {
  it("shows markAllReadSuccess toast after marking all as read", async () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("mark-all-read-button"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("markAllReadSuccess");
    });
  });

  it("shows dismissed toast after dismissing a notification", async () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("dismiss-1"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("dismissed");
    });
  });
});

describe("NotificationList — badge count sync", () => {
  it("decrements badge count when marking an unread notification as read", async () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("mark-read-1"));
    await waitFor(() => {
      expect(contextState.decrement).toHaveBeenCalledOnce();
    });
  });

  it("does not decrement badge count when marking an already-read notification", async () => {
    notifState.notifications = [makeNotification("1", new Date())];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("mark-read-1"));
    await waitFor(() => {
      expect(contextState.decrement).not.toHaveBeenCalled();
    });
  });

  it("decrements badge count when dismissing an unread notification", async () => {
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("dismiss-1"));
    await waitFor(() => {
      expect(contextState.decrement).toHaveBeenCalledOnce();
    });
  });

  it("does NOT decrement when markAsRead returns false (API error)", async () => {
    notifState.markAsRead.mockResolvedValueOnce(false);
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("mark-read-1"));
    await waitFor(() => {
      expect(contextState.decrement).not.toHaveBeenCalled();
    });
  });

  it("does NOT decrement when dismiss returns false (API error)", async () => {
    notifState.dismiss.mockResolvedValueOnce(false);
    notifState.notifications = [makeNotification("1", null)];
    render(<NotificationList />);
    await userEvent.click(screen.getByTestId("dismiss-1"));
    await waitFor(() => {
      expect(contextState.decrement).not.toHaveBeenCalled();
    });
  });
});
