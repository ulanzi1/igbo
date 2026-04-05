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

  it("guest login link points to community login, not portal", () => {
    process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
    setGuest();
    render(<PortalBottomNav />);
    const loginLink = screen.getByText("login").closest("a");
    expect(loginLink).toHaveAttribute("href", "http://localhost:3000/login");
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

  it("renders admin tabs for JOB_ADMIN role", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("reviewQueue")).toBeInTheDocument();
    expect(screen.getByText("reports")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
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

  it("admin Settings link points to /en/admin/settings", () => {
    setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
    render(<PortalBottomNav />);
    const settingsLink = screen.getByText("settings").closest("a");
    expect(settingsLink).toHaveAttribute("href", "/en/admin/settings");
  });
});
