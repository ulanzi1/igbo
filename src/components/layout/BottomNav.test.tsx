// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { BottomNav } from "./BottomNav";

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

describe("BottomNav", () => {
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
    expect(screen.getByText("Navigation.discover")).toBeInTheDocument();
    expect(screen.getByText("Navigation.events")).toBeInTheDocument();
    expect(screen.getByText("Navigation.profile")).toBeInTheDocument();
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
});
