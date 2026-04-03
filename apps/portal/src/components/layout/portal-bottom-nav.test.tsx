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
    setSession({ user: { activePortalRole: "JOB_SEEKER" } });
    render(<PortalBottomNav />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("jobs")).toBeInTheDocument();
    expect(screen.getByText("myApplications")).toBeInTheDocument();
    expect(screen.getByText("messages")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
  });

  it("renders employer tabs for EMPLOYER role", () => {
    setSession({ user: { activePortalRole: "EMPLOYER" } });
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
    setSession({ user: { activePortalRole: "JOB_SEEKER" } });
    vi.mocked(usePathname).mockReturnValue("/en/jobs");
    render(<PortalBottomNav />);
    const jobsLink = screen.getByText("jobs").closest("a");
    expect(jobsLink).toHaveAttribute("aria-current", "page");
  });

  it("uses locale-aware hrefs (not hardcoded /en)", () => {
    setSession({ user: { activePortalRole: "JOB_SEEKER" } });
    render(<PortalBottomNav />);
    const jobsLink = screen.getByText("jobs").closest("a");
    // With mocked useLocale returning "en", href should be /en/jobs
    expect(jobsLink).toHaveAttribute("href", "/en/jobs");
  });
});
