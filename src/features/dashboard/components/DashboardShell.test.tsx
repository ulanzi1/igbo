// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/dashboard",
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
}));

vi.mock("lucide-react", () => ({
  NewspaperIcon: () => <span data-testid="newspaper-icon" />,
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, isLoading: false, error: null }),
}));

vi.mock("./PeopleNearYouWidget", () => ({
  PeopleNearYouWidget: () => <div data-testid="people-near-you-widget" />,
}));

import { DashboardShell } from "./DashboardShell";

describe("DashboardShell", () => {
  it("renders without crashing", () => {
    render(<DashboardShell displayName="Chidi" />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the DashboardGreeting with displayName", () => {
    render(<DashboardShell displayName="Chidi Obi" />);
    // Greeting uses t("greeting.welcome", { name }) — mock returns key(params)
    expect(screen.getByText('greeting.welcome({"name":"Chidi Obi"})')).toBeInTheDocument();
  });

  it("renders the primary content area as a main element", () => {
    render(<DashboardShell displayName="Adaeze" />);
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
  });

  it("renders a sidebar with the people-near-you widget", () => {
    const { container } = render(<DashboardShell displayName="Chidi" />);
    expect(container.querySelector("aside")).toBeInTheDocument();
    expect(screen.getByTestId("people-near-you-widget")).toBeInTheDocument();
  });

  it("renders GettingStartedWidget in the primary content area", () => {
    render(<DashboardShell displayName="Chidi" />);
    // GettingStartedWidget renders t("gettingStarted.title")
    expect(screen.getByText("gettingStarted.title")).toBeInTheDocument();
  });

  it("accepts an optional avatarUrl prop", () => {
    // Should render without throwing
    expect(() =>
      render(<DashboardShell displayName="Chidi" avatarUrl="https://example.com/pic.jpg" />),
    ).not.toThrow();
  });

  it("renders a Go to Feed link pointing to /feed", () => {
    render(<DashboardShell displayName="Chidi" />);
    const feedLink = screen.getByText("goToFeed");
    expect(feedLink).toBeInTheDocument();
    expect(feedLink.closest("a")).toHaveAttribute("href", "/feed");
  });
});
