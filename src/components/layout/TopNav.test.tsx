// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { TopNav } from "./TopNav";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
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

vi.mock("@/hooks/use-contrast-mode", () => ({
  useContrastMode: () => ({
    mode: "default",
    toggle: vi.fn(),
    isHighContrast: false,
  }),
}));

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("@/features/notifications", () => ({
  NotificationBell: () => (
    <button type="button" aria-label="Navigation.notifications">
      Bell
    </button>
  ),
}));

// Mock DropdownMenu to always render content (no open/close in jsdom)
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

describe("TopNav", () => {
  it("renders as a header element", () => {
    render(<TopNav />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders notification bell placeholder", () => {
    render(<TopNav />);
    expect(screen.getByLabelText("Navigation.notifications")).toBeInTheDocument();
  });

  it("renders ContrastToggle button", () => {
    render(<TopNav />);
    const button = screen.getByLabelText("Shell.contrastToggle");
    expect(button).toBeInTheDocument();
  });

  it("renders LanguageToggle button", () => {
    render(<TopNav />);
    // DropdownMenu mock renders content inline, so LanguageToggle appears in header + dropdown
    const buttons = screen.getAllByLabelText("Shell.languageToggle");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders profile dropdown trigger with correct aria-label", () => {
    render(<TopNav />);
    expect(screen.getByLabelText("Navigation.profile")).toBeInTheDocument();
  });

  it("renders logo link", () => {
    render(<TopNav />);
    const logo = screen.getByLabelText("Shell.appName");
    expect(logo).toBeInTheDocument();
  });

  it("renders desktop nav links including Feed and Saved", () => {
    render(<TopNav />);
    // Mobile nav is closed by default — only desktop nav visible
    const navs = screen.getAllByRole("navigation", { name: "Main navigation" });
    const desktopNav = navs[0]!;
    expect(desktopNav.querySelector('a[href="/feed"]')).toBeInTheDocument();
    expect(desktopNav.querySelector('a[href="/saved"]')).toBeInTheDocument();
  });

  it("renders hamburger button on mobile", () => {
    render(<TopNav />);
    expect(screen.getByLabelText("Shell.menuOpen")).toBeInTheDocument();
  });

  it("opens mobile nav when hamburger is clicked", () => {
    render(<TopNav />);
    const hamburger = screen.getByLabelText("Shell.menuOpen");
    fireEvent.click(hamburger);
    // Two navs now: desktop hidden + mobile visible
    const navs = screen.getAllByRole("navigation", { name: "Main navigation" });
    expect(navs.length).toBe(2);
    // Mobile nav has the feed link
    expect(screen.getAllByRole("link", { name: "Navigation.feed" }).length).toBeGreaterThan(0);
  });

  it("closes mobile nav when hamburger is clicked again", () => {
    render(<TopNav />);
    const hamburger = screen.getByLabelText("Shell.menuOpen");
    fireEvent.click(hamburger);
    fireEvent.click(screen.getByLabelText("Shell.menuClose"));
    // Back to one nav
    const navs = screen.getAllByRole("navigation", { name: "Main navigation" });
    expect(navs.length).toBe(1);
  });

  it("profile dropdown contains View Profile, Settings, and Logout", () => {
    render(<TopNav />);
    // DropdownMenu is mocked to always render content (no open/close needed in jsdom)
    expect(screen.getByText("Navigation.viewProfile")).toBeInTheDocument();
    expect(screen.getByText("Navigation.settings")).toBeInTheDocument();
    expect(screen.getByText("Navigation.logout")).toBeInTheDocument();
  });

  it("clicking logout calls signOut", () => {
    render(<TopNav />);
    fireEvent.click(screen.getByText("Navigation.logout"));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
