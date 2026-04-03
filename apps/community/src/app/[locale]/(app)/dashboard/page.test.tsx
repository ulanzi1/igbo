// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: vi.fn(),
}));

const mockRedirect = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
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
}));

const mockAuth = vi.fn();
vi.mock("@igbo/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/features/dashboard", () => ({
  DashboardShell: ({
    displayName,
    avatarUrl,
  }: {
    displayName: string;
    avatarUrl?: string | null;
  }) => (
    <div data-testid="dashboard-shell" data-name={displayName} data-avatar={avatarUrl ?? ""}>
      DashboardShell
    </div>
  ),
}));

import DashboardPage, { generateMetadata } from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await DashboardPage({ params: Promise.resolve({ locale: "en" }) });
    expect(result).toBeNull();
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/login", locale: "en" });
  });

  it("redirects to /login when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const result = await DashboardPage({ params: Promise.resolve({ locale: "en" }) });
    expect(result).toBeNull();
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/login", locale: "en" });
  });

  it("renders DashboardShell with session data when authenticated", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Chidi Obi", image: "https://example.com/avatar.jpg" },
    });
    const Page = await DashboardPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page!);
    const shell = screen.getByTestId("dashboard-shell");
    expect(shell).toBeInTheDocument();
    expect(shell.dataset.name).toBe("Chidi Obi");
    expect(shell.dataset.avatar).toBe("https://example.com/avatar.jpg");
  });

  it("passes empty string for displayName when session name is null", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: null, image: null },
    });
    const Page = await DashboardPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page!);
    const shell = screen.getByTestId("dashboard-shell");
    expect(shell.dataset.name).toBe("");
    expect(shell.dataset.avatar).toBe("");
  });

  it("renders DashboardShell for Igbo locale", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Adaeze", image: null },
    });
    const Page = await DashboardPage({ params: Promise.resolve({ locale: "ig" }) });
    render(Page!);
    const shell = screen.getByTestId("dashboard-shell");
    expect(shell).toBeInTheDocument();
    expect(shell.dataset.name).toBe("Adaeze");
  });
});

describe("generateMetadata", () => {
  it("returns title from Dashboard namespace translations", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata).toEqual({ title: "pageTitle" });
  });
});
