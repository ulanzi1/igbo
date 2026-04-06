// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
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

import { AdminShell, AdminSidebar, AdminPageHeader } from "./AdminShell";

describe("AdminShell", () => {
  it("renders sidebar with OBIGBO Admin branding", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );

    expect(screen.getByText("Admin.siteTitle")).toBeInTheDocument();
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
    expect(screen.getByText("Admin.sidebar.governance")).toBeInTheDocument();
    expect(screen.getByText("Admin.sidebar.gamification")).toBeInTheDocument();
    expect(screen.getByText("Admin.sidebar.leaderboard")).toBeInTheDocument();
  });

  it("does not render a reports nav link", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );
    expect(screen.queryByText("Admin.sidebar.reports")).not.toBeInTheDocument();
  });

  it("governance link points to /admin/governance", () => {
    render(<AdminSidebar />);
    const link = screen.getByText("Admin.sidebar.governance").closest("a");
    expect(link).toHaveAttribute("href", "/admin/governance");
  });

  it("gamification link points to /admin/gamification", () => {
    render(<AdminSidebar />);
    const link = screen.getByText("Admin.sidebar.gamification").closest("a");
    expect(link).toHaveAttribute("href", "/admin/gamification");
  });

  it("leaderboard link points to /admin/leaderboard", () => {
    render(<AdminSidebar />);
    const link = screen.getByText("Admin.sidebar.leaderboard").closest("a");
    expect(link).toHaveAttribute("href", "/admin/leaderboard");
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

    expect(screen.getByRole("navigation", { name: "Admin.navAriaLabel" })).toBeInTheDocument();
  });

  it("renders sign-out button in sidebar", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );
    expect(screen.getByText("Admin.signOut")).toBeInTheDocument();
  });

  it("sign-out button calls signOut", () => {
    render(
      <AdminShell>
        <div>Content</div>
      </AdminShell>,
    );
    fireEvent.click(screen.getByText("Admin.signOut"));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("AdminSidebar", () => {
  it("is exported and renders independently", () => {
    render(<AdminSidebar />);
    expect(screen.getByText("Admin.siteTitle")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin.navAriaLabel" })).toBeInTheDocument();
  });
});

describe("AdminPageHeader", () => {
  it("renders title", () => {
    render(<AdminPageHeader title="Test Page" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Test Page");
  });

  it("renders breadcrumbs with links", () => {
    render(
      <AdminPageHeader
        title="Members"
        breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "Members" }]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Members", { selector: "span" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not render breadcrumb nav when no breadcrumbs provided", () => {
    render(<AdminPageHeader title="Test" />);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(<AdminPageHeader title="Test" actions={<button type="button">Add New</button>} />);
    expect(screen.getByRole("button", { name: "Add New" })).toBeInTheDocument();
  });
});
