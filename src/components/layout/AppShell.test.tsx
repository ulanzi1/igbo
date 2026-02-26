// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { AppShell } from "./AppShell";

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

vi.mock("@/providers/SocketProvider", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocketContext: () => ({ notificationsSocket: null, chatSocket: null, isConnected: false }),
}));

describe("AppShell", () => {
  it("renders children in main content area", () => {
    render(
      <AppShell>
        <p>Test content</p>
      </AppShell>,
    );
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("renders TopNav header", () => {
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders BottomNav for mobile", () => {
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );
    // BottomNav has role="navigation" with aria-label="Main navigation"
    const navs = screen.getAllByRole("navigation");
    const bottomNav = navs.find((el) => el.getAttribute("aria-label") === "Main navigation");
    expect(bottomNav).toBeInTheDocument();
  });

  it("has id=main-content on main element", () => {
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );
    expect(document.getElementById("main-content")).toBeInTheDocument();
  });
});
