// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string) => (key: string) => `${ns}.${key}`,
  setRequestLocale: vi.fn(),
}));

vi.mock("@/components/banner-slider", () => ({
  BannerSlider: () => null,
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

import SplashPage from "./page";

describe("SplashPage", () => {
  it("renders the brand header with OBIGBO title", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("OBIGBO");
  });

  it("renders three CTA options", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Splash.exploreGuest")).toBeInTheDocument();
    expect(screen.getByText("Splash.contactJoin")).toBeInTheDocument();
    expect(screen.getByText("Splash.membersLogin")).toBeInTheDocument();
  });

  it("renders social proof section", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Splash.socialProofHeading")).toBeInTheDocument();
    expect(screen.getByText("Splash.stat1")).toBeInTheDocument();
    expect(screen.getByText("Splash.stat2")).toBeInTheDocument();
    expect(screen.getByText("Splash.stat3")).toBeInTheDocument();
  });

  it("has a single h1 element", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
  });

  it("renders JSON-LD script tag", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(Page);
    const jsonLd = container.querySelector('script[type="application/ld+json"]');
    expect(jsonLd).toBeInTheDocument();
  });

  it("CTA links point to correct destinations", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const exploreLink = screen.getByText("Splash.exploreGuest").closest("a");
    expect(exploreLink).toHaveAttribute("href", "/articles");

    const joinLink = screen.getByText("Splash.contactJoin").closest("a");
    expect(joinLink).toHaveAttribute("href", "/apply");

    const loginLink = screen.getByText("Splash.membersLogin").closest("a");
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("has accessible CTA buttons with minimum tap target size", async () => {
    const Page = await SplashPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const ctaLinks = screen
      .getAllByRole("link")
      .filter(
        (link) =>
          link.textContent === "Splash.exploreGuest" ||
          link.textContent === "Splash.contactJoin" ||
          link.textContent === "Splash.membersLogin",
      );
    ctaLinks.forEach((link) => {
      expect(link.className).toMatch(/min-h-\[44px\]/);
    });
  });
});
