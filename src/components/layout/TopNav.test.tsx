// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
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

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
}));

vi.mock("@/features/notifications", () => ({
  NotificationBell: () => (
    <button type="button" aria-label="Navigation.notifications">
      Bell
    </button>
  ),
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
    // ContrastToggle renders a button with aria-label
    const button = screen.getByLabelText("Shell.contrastToggle");
    expect(button).toBeInTheDocument();
  });

  it("renders LanguageToggle button", () => {
    render(<TopNav />);
    const button = screen.getByLabelText("Shell.languageToggle");
    expect(button).toBeInTheDocument();
  });

  it("renders profile avatar placeholder", () => {
    render(<TopNav />);
    expect(screen.getByLabelText("Navigation.profile")).toBeInTheDocument();
  });

  it("renders logo link", () => {
    render(<TopNav />);
    const logo = screen.getByLabelText("Shell.appName");
    expect(logo).toBeInTheDocument();
  });

  it("renders desktop nav links", () => {
    render(<TopNav />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
  });
});
