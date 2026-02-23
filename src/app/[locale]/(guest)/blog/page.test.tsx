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
  usePathname: () => "/blog",
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

import BlogPage from "./page";

describe("BlogPage", () => {
  it("renders empty state with CTA when no data", async () => {
    const Page = await BlogPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Blog.emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("Blog.emptyDescription")).toBeInTheDocument();
    expect(screen.getByText("Blog.ctaButton")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await BlogPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
