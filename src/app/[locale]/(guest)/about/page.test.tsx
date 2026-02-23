// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/about",
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

import AboutPage from "./page";

describe("AboutPage", () => {
  it("renders i18n content sections", async () => {
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("About.title")).toBeInTheDocument();
    expect(screen.getByText("About.missionText")).toBeInTheDocument();
    expect(screen.getByText("About.visionText")).toBeInTheDocument();
  });

  it("renders membership CTA", async () => {
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const cta = screen.getByText("About.ctaButton");
    expect(cta).toBeInTheDocument();
    expect(cta.closest("a")).toHaveAttribute("href", "/apply");
  });

  it("has a single h1", async () => {
    const Page = await AboutPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
