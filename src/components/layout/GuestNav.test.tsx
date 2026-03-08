// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";
import { GuestNav } from "./GuestNav";

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
let mockSession: { data: { user: { id: string; name: string } } | null } = { data: null };
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
  signOut: () => mockSignOut(),
}));

describe("GuestNav", () => {
  beforeEach(() => {
    mockSession = { data: null };
  });

  it("renders as a header element", () => {
    render(<GuestNav />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders logo link", () => {
    render(<GuestNav />);
    expect(screen.getByLabelText("Shell.appName")).toBeInTheDocument();
  });

  it("renders About link in desktop nav", () => {
    render(<GuestNav />);
    const nav = screen.getByRole("navigation", { name: "Guest navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveTextContent("Navigation.about");
  });

  it("renders Articles, Events, and Blog links in desktop nav", () => {
    render(<GuestNav />);
    const nav = screen.getByRole("navigation", { name: "Guest navigation" });
    expect(nav).toHaveTextContent("Navigation.articles");
    expect(nav).toHaveTextContent("Navigation.events");
    expect(nav).toHaveTextContent("Navigation.blog");
  });

  it("renders LanguageToggle", () => {
    render(<GuestNav />);
    // LanguageToggle renders button with aria-label
    const buttons = screen.getAllByLabelText("Shell.languageToggle");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders ContrastToggle", () => {
    render(<GuestNav />);
    const buttons = screen.getAllByLabelText("Shell.contrastToggle");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Join Community CTA button", () => {
    render(<GuestNav />);
    expect(screen.getAllByText("Navigation.join").length).toBeGreaterThanOrEqual(1);
  });

  it("renders hamburger menu button for mobile", () => {
    render(<GuestNav />);
    expect(screen.getByLabelText("Shell.menuOpen")).toBeInTheDocument();
  });

  it("shows Join CTA when unauthenticated", () => {
    render(<GuestNav />);
    expect(screen.getAllByText("Navigation.join").length).toBeGreaterThanOrEqual(1);
  });

  describe("when authenticated", () => {
    beforeEach(() => {
      mockSession = { data: { user: { id: "user-123", name: "Ada Okafor" } } };
    });

    it("shows profile button instead of Join CTA", () => {
      render(<GuestNav />);
      expect(screen.getByLabelText("Navigation.profile")).toBeInTheDocument();
      expect(screen.queryByText("Navigation.join")).toBeNull();
    });

    it("logo links to /dashboard for authenticated users", () => {
      render(<GuestNav />);
      const logo = screen.getByLabelText("Shell.appName");
      expect(logo.closest("a")).toHaveAttribute("href", "/dashboard");
    });
  });
});
