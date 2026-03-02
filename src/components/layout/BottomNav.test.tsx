// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { BottomNav } from "./BottomNav";

const mockUseUnreadCount = vi.fn().mockReturnValue({
  totalUnread: 0,
  unreadCounts: {},
  markConversationRead: vi.fn(),
});

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${namespace}.${key}:${JSON.stringify(params)}`;
    return `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

vi.mock("@/providers/SocketProvider", () => ({
  useSocketContext: () => ({
    chatSocket: null,
    notificationsSocket: null,
    isConnected: false,
  }),
}));

vi.mock("@/features/chat/hooks/use-unread-count", () => ({
  useUnreadCount: (...args: unknown[]) => mockUseUnreadCount(...args),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    mockUseUnreadCount.mockReturnValue({
      totalUnread: 0,
      unreadCounts: {},
      markConversationRead: vi.fn(),
    });
  });

  it("renders as a navigation element with correct aria-label", () => {
    render(<BottomNav />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("renders 5 tab items", () => {
    render(<BottomNav />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
  });

  it("renders all 5 navigation labels", () => {
    render(<BottomNav />);
    expect(screen.getByText("Navigation.home")).toBeInTheDocument();
    expect(screen.getByText("Navigation.chat")).toBeInTheDocument();
    expect(screen.getByText("Navigation.feed")).toBeInTheDocument();
    expect(screen.getByText("Navigation.discover")).toBeInTheDocument();
    expect(screen.getByText("Navigation.profile")).toBeInTheDocument();
  });

  it("includes a Feed tab linking to /feed", () => {
    render(<BottomNav />);
    const feedTab = screen.getByRole("tab", { name: /Navigation\.feed/i });
    expect(feedTab).toBeInTheDocument();
    expect(feedTab).toHaveAttribute("href", "/feed");
  });

  it("marks the home tab as selected when on root path", () => {
    render(<BottomNav />);
    const homeTab = screen.getByRole("tab", { name: /Navigation\.home/i });
    expect(homeTab).toHaveAttribute("aria-selected", "true");
  });

  it("tab links have minimum 44px tap targets", () => {
    render(<BottomNav />);
    const tabs = screen.getAllByRole("tab");
    tabs.forEach((tab) => {
      expect(tab).toHaveClass("min-h-[44px]");
    });
  });

  it("does not render unread badge when totalUnread is 0", () => {
    render(<BottomNav />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders unread badge on chat tab when totalUnread > 0", () => {
    mockUseUnreadCount.mockReturnValue({
      totalUnread: 5,
      unreadCounts: { "conv-1": 3, "conv-2": 2 },
      markConversationRead: vi.fn(),
    });
    render(<BottomNav />);
    const badge = screen.getByRole("status");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("5");
  });

  it("displays 99+ when totalUnread exceeds 99", () => {
    mockUseUnreadCount.mockReturnValue({
      totalUnread: 150,
      unreadCounts: { "conv-1": 150 },
      markConversationRead: vi.fn(),
    });
    render(<BottomNav />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("99+");
  });

  it("badge has translated aria-label for accessibility", () => {
    mockUseUnreadCount.mockReturnValue({
      totalUnread: 3,
      unreadCounts: { "conv-1": 3 },
      markConversationRead: vi.fn(),
    });
    render(<BottomNav />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("aria-label", expect.stringContaining("chatUnread"));
  });
});
