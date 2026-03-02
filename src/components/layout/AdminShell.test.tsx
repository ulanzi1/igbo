// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin",
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { AdminShell } from "./AdminShell";

describe("AdminShell", () => {
  it("renders sidebar with OBIGBO Admin branding", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );

    expect(screen.getByText("OBIGBO Admin")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );

    expect(screen.getByText("Admin.sidebar.dashboard")).toBeInTheDocument();
    expect(screen.getByText("Admin.sidebar.approvals")).toBeInTheDocument();
    expect(screen.getByText("Admin.sidebar.members")).toBeInTheDocument();
    expect(screen.getByText("Admin.sidebar.moderation")).toBeInTheDocument();
  });

  it("renders children in main content area", () => {
    render(
      <AdminShell>
        <div data-testid="child">Content</div>
      </AdminShell>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("child"));
  });

  it("marks current page with aria-current", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );

    const dashboardLink = screen.getByText("Admin.sidebar.dashboard");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  it("has admin navigation landmark", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );

    expect(screen.getByRole("navigation", { name: "Admin navigation" })).toBeInTheDocument();
  });
});
