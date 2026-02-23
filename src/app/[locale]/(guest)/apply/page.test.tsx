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
  usePathname: () => "/apply",
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

import ApplyPage from "./page";

describe("ApplyPage", () => {
  it("renders i18n heading and description", async () => {
    const Page = await ApplyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Apply.heading")).toBeInTheDocument();
    expect(screen.getByText("Apply.description")).toBeInTheDocument();
  });

  it("renders contact info section", async () => {
    const Page = await ApplyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Apply.contactInfo")).toBeInTheDocument();
    expect(screen.getByText("Apply.emailLabel")).toBeInTheDocument();
  });

  it("renders back to home link", async () => {
    const Page = await ApplyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    const backLink = screen.getByText("Apply.backToHome");
    expect(backLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("has a single h1", async () => {
    const Page = await ApplyPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
