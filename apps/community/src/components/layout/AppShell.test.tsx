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

const mockSessionData = vi.hoisted(() => ({
  current: { data: null, status: "unauthenticated" } as {
    data: unknown;
    status: string;
    update?: unknown;
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mockSessionData.current,
}));

vi.mock("@/providers/SocketProvider", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocketContext: () => ({
    notificationsSocket: null,
    chatSocket: null,
    isConnected: false,
    connectionPhase: "connected" as const,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard",
}));

vi.mock("@/components/ServiceDegradationBanner", () => ({
  ServiceDegradationBanner: () => null,
}));

vi.mock("@/components/MaintenanceBanner", () => ({
  MaintenanceBanner: () => null,
}));

vi.mock("@/components/ConnectionStatusBanner", () => ({
  ConnectionStatusBanner: () => null,
}));

vi.mock("@/features/profiles", () => ({
  useMyProfilePhoto: () => ({ data: undefined }),
}));

// Mock for useUnreadCount (used by BottomNav)
vi.mock("@/hooks/use-unread-count", () => ({
  useUnreadCount: () => 0,
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
    const bottomNav = navs.find(
      (el) => el.getAttribute("aria-label") === "Navigation.mainNavLabel",
    );
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

  it("renders warning banner when authenticated user has active warnings", async () => {
    // Set session to authenticated
    mockSessionData.current = {
      data: { user: { id: "u1" }, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    };

    // Mock fetch to return warnings
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          warnings: [
            { id: "w1", reason: "Test warning reason", createdAt: "2026-03-20T00:00:00Z" },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    // Wait for the query to resolve and banner to appear
    const banner = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(banner).toBeInTheDocument();

    // Reset
    mockSessionData.current = { data: null, status: "unauthenticated" };
    vi.unstubAllGlobals();
  });
});
