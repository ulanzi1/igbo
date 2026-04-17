// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Session } from "next-auth";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/en"),
}));

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { PortalBottomNav } from "./portal-bottom-nav";

function setSession(overrides?: { user?: Record<string, unknown> }) {
  vi.mocked(useSession).mockReturnValue({
    data: {
      user: { id: "u1", ...overrides?.user },
      expires: "2099-01-01",
    } as Session,
    status: "authenticated",
    update: vi.fn(),
  });
}

function setGuest() {
  vi.mocked(useSession).mockReturnValue({
    data: null,
    status: "unauthenticated",
    update: vi.fn(),
  });
}

describe("PortalBottomNav", () => {
  it("renders seeker tabs for JOB_SEEKER role", () => {
    setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("jobs")).toBeInTheDocument();
    expect(screen.getByText("myApplications")).toBeInTheDocument();
    expect(screen.getByText("messages")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
  });

  it("renders employer tabs for EMPLOYER role", () => {
    setSession({ user: { activePortalRole: "EMPLOYER", portalRoles: ["EMPLOYER"] } });
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("messages")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
    expect(screen.queryByText("myApplications")).not.toBeInTheDocument();
  });

  it("renders guest tabs for unauthenticated users", () => {
    process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
    setGuest();
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("browseAll")).toBeInTheDocument();
    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.queryByText("myApplications")).not.toBeInTheDocument();
  });

  it("guest login link points to community login with callbackUrl back to portal", () => {
    process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_PORTAL_URL = "http://localhost:3001";
    setGuest();
    render(<PortalBottomNav />);
    const loginLink = screen.getByText("login").closest("a");
    const href = loginLink?.getAttribute("href") ?? "";
    expect(href).toContain("http://localhost:3000/login");
    expect(href).toContain("callbackUrl=");
  });

  it("guest login link callbackUrl reflects current page (dynamic callbackUrl)", () => {
    process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_PORTAL_URL = "http://localhost:3001";
    setGuest();
    render(<PortalBottomNav />);
    const loginLink = screen.getByText("login").closest("a");
    const href = loginLink?.getAttribute("href") ?? "";
    expect(href).toContain("http://localhost:3000/login");
    // Verify the decoded callbackUrl contains the current page (JSDOM default: http://localhost/)
    const url = new URL(href);
    const callbackUrl = url.searchParams.get("callbackUrl") ?? "";
    expect(callbackUrl).toContain("http://localhost");
  });

  it("marks active tab based on current pathname", () => {
    setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
    vi.mocked(usePathname).mockReturnValue("/en/jobs");
    render(<PortalBottomNav />);
    const jobsLink = screen.getByText("jobs").closest("a");
    expect(jobsLink).toHaveAttribute("aria-current", "page");
  });

  it("uses locale-aware hrefs (not hardcoded /en)", () => {
    setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
    render(<PortalBottomNav />);
    const jobsLink = screen.getByText("jobs").closest("a");
    // With mocked useLocale returning "en", href should be /en/jobs
    expect(jobsLink).toHaveAttribute("href", "/en/jobs");
  });

  it("guest browseAll link points to /en/search (P-4.1B nav update)", () => {
    process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
    setGuest();
    render(<PortalBottomNav />);
    const browseLink = screen.getByText("browseAll").closest("a");
    expect(browseLink).toHaveAttribute("href", "/en/search");
  });

  it("guest discover link points to /en/jobs (P-4.2 nav update)", () => {
    setGuest();
    render(<PortalBottomNav />);
    const discoverLink = screen.getByText("discover").closest("a");
    expect(discoverLink).toHaveAttribute("href", "/en/jobs");
  });

  it("renders admin tabs for JOB_ADMIN role", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("reviewQueue")).toBeInTheDocument();
    expect(screen.getByText("reports")).toBeInTheDocument();
    expect(screen.queryByText("myApplications")).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
  });

  it("admin Review Queue link points to /en/admin", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    const queueLink = screen.getByText("reviewQueue").closest("a");
    expect(queueLink).toHaveAttribute("href", "/en/admin");
  });

  it("admin Reports link points to /en/admin/reports", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    const reportsLink = screen.getByText("reports").closest("a");
    expect(reportsLink).toHaveAttribute("href", "/en/admin/reports");
  });

  it("does not reference the removed Portal.nav.settings key", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    // Regression: Portal.nav.settings was removed in P-3x.3; bottom nav must not reference it.
    expect(screen.queryByText("settings")).not.toBeInTheDocument();
  });
});
