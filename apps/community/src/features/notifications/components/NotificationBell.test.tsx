// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { expectNoA11yViolations } from "@/test/a11y-utils";

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

const mockUseNotifications = vi.fn();
vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

// Mock fetch for mark-read actions
global.fetch = vi.fn().mockResolvedValue({ ok: true });

import { NotificationBell } from "./NotificationBell";

const DEFAULT_STATE = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNotifications.mockReturnValue(DEFAULT_STATE);
});

describe("NotificationBell", () => {
  it("renders the bell button", () => {
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: "title" })).toBeInTheDocument();
  });

  it("shows unread count badge when there are unread notifications", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_STATE, unreadCount: 5 });
    render(<NotificationBell />);

    // Badge shows count
    const badge = screen.getByText("5");
    expect(badge).toBeInTheDocument();
  });

  it("shows accessible label with count when unread > 0", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_STATE, unreadCount: 3 });
    render(<NotificationBell />);

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("unreadBadgeLabel");
  });

  it("does not show badge when unread count is 0", () => {
    render(<NotificationBell />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens dropdown when bell is clicked", () => {
    render(<NotificationBell />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("closes dropdown when clicking outside", () => {
    render(
      <div>
        <NotificationBell />
        <div data-testid="outside">Outside</div>
      </div>,
    );

    // Open
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows loading state in dropdown when isLoading", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_STATE, isLoading: true });
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("caps badge display at 99", () => {
    mockUseNotifications.mockReturnValue({ ...DEFAULT_STATE, unreadCount: 150 });
    render(<NotificationBell />);

    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("has aria-expanded=false when closed", () => {
    render(<NotificationBell />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("has aria-expanded=true when open", () => {
    render(<NotificationBell />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<NotificationBell />);
    await expectNoA11yViolations(container);
  });
});
