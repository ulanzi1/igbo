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
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector('a[href="/feed"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/saved"]')).toBeInTheDocument();
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
