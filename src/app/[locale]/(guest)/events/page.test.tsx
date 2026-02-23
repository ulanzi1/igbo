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
  usePathname: () => "/events",
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

import EventsPage from "./page";

describe("EventsPage", () => {
  it("renders empty state with CTA when no data", async () => {
    const Page = await EventsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getByText("Events.emptyTitle")).toBeInTheDocument();
    expect(screen.getByText("Events.emptyDescription")).toBeInTheDocument();
    expect(screen.getByText("Events.ctaButton")).toBeInTheDocument();
  });

  it("has a single h1", async () => {
    const Page = await EventsPage({ params: Promise.resolve({ locale: "en" }) });
    render(Page);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
