// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { GuestShell } from "./GuestShell";

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

describe("GuestShell", () => {
  it("renders children in main content area", () => {
    render(
      <GuestShell>
        <p>Guest content</p>
      </GuestShell>,
    );
    expect(screen.getByText("Guest content")).toBeInTheDocument();
  });

  it("renders GuestNav header", () => {
    render(
      <GuestShell>
        <p>Content</p>
      </GuestShell>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("has id=main-content on main element", () => {
    render(
      <GuestShell>
        <p>Content</p>
      </GuestShell>,
    );
    expect(document.getElementById("main-content")).toBeInTheDocument();
  });

  it("renders Footer", () => {
    render(
      <GuestShell>
        <p>Content</p>
      </GuestShell>,
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
