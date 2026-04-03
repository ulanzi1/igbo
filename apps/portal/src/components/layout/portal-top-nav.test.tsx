// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { useSession } from "next-auth/react";
import { PortalTopNav } from "./portal-top-nav";

function setSession(overrides?: { user?: Record<string, unknown> }) {
  vi.mocked(useSession).mockReturnValue({
    data: {
      user: { id: "u1", name: "Test User", ...overrides?.user },
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

beforeEach(() => {
  process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
});

describe("PortalTopNav", () => {
  describe("seeker role", () => {
    it("renders seeker nav items", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER" } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("jobs").length).toBeGreaterThan(0);
      expect(screen.getAllByText("browseAll").length).toBeGreaterThan(0);
      expect(screen.getAllByText("apprenticeships").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myApplications").length).toBeGreaterThan(0);
      expect(screen.getAllByText("savedJobs").length).toBeGreaterThan(0);
    });

    it("shows role indicator badge with seeker text", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER" } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("seeker").length).toBeGreaterThan(0);
    });
  });

  describe("employer role", () => {
    it("renders employer nav items", () => {
      setSession({ user: { activePortalRole: "EMPLOYER" } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myJobs").length).toBeGreaterThan(0);
      expect(screen.getAllByText("applications").length).toBeGreaterThan(0);
      expect(screen.getAllByText("companyProfile").length).toBeGreaterThan(0);
    });

    it("shows role indicator badge with employer text", () => {
      setSession({ user: { activePortalRole: "EMPLOYER" } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("employer").length).toBeGreaterThan(0);
    });
  });

  describe("guest", () => {
    it("renders guest nav items (browse jobs, apprenticeships)", () => {
      setGuest();
      render(<PortalTopNav />);
      expect(screen.getAllByText("browseAll").length).toBeGreaterThan(0);
    });

    it("renders login and join buttons for unauthenticated users", () => {
      setGuest();
      render(<PortalTopNav />);
      expect(screen.getByText("login")).toBeInTheDocument();
      expect(screen.getByText("joinNow")).toBeInTheDocument();
    });
  });

  describe("Back to Community link", () => {
    it("is always visible (for seeker)", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER" } });
      render(<PortalTopNav />);
      const links = screen.getAllByTestId("back-to-community");
      expect(links.length).toBeGreaterThan(0);
    });

    it("href equals NEXT_PUBLIC_COMMUNITY_URL", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER" } });
      render(<PortalTopNav />);
      const link = screen.getByTestId("back-to-community");
      expect(link).toHaveAttribute("href", "http://localhost:3000");
    });

    it("is present for guest users", () => {
      setGuest();
      render(<PortalTopNav />);
      // Back to community link should be in mobile nav (SheetContent isn't rendered in DOM until open)
      // but the desktop "Back to Community" link is always rendered
      const links = screen.getAllByText("backToCommunity");
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
