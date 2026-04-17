// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Session } from "next-auth";

const mockSignOut = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

import { fireEvent } from "@testing-library/react";
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
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
});

describe("PortalTopNav", () => {
  describe("seeker role", () => {
    it("renders seeker nav items", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("jobs").length).toBeGreaterThan(0);
      expect(screen.getAllByText("browseAll").length).toBeGreaterThan(0);
      expect(screen.getAllByText("apprenticeships").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myApplications").length).toBeGreaterThan(0);
      expect(screen.getAllByText("savedJobs").length).toBeGreaterThan(0);
    });

    it("shows role switcher for multi-role seeker user", () => {
      setSession({
        user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] },
      });
      render(<PortalTopNav />);
      expect(screen.getByRole("button", { name: "switchRoleLabel" })).toBeInTheDocument();
    });
  });

  describe("employer role", () => {
    it("renders employer nav items", () => {
      setSession({ user: { activePortalRole: "EMPLOYER", portalRoles: ["EMPLOYER"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("myJobs").length).toBeGreaterThan(0);
      expect(screen.getAllByText("applications").length).toBeGreaterThan(0);
      expect(screen.getAllByText("companyProfile").length).toBeGreaterThan(0);
    });

    it("shows role switcher for multi-role employer user", () => {
      setSession({
        user: { activePortalRole: "EMPLOYER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] },
      });
      render(<PortalTopNav />);
      // RoleSwitcher trigger button rendered for multi-role
      expect(screen.getByRole("button", { name: "switchRoleLabel" })).toBeInTheDocument();
    });
  });

  describe("admin role", () => {
    it("renders admin nav items", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("reviewQueue").length).toBeGreaterThan(0);
      expect(screen.getAllByText("reports").length).toBeGreaterThan(0);
      expect(screen.getAllByText("analytics").length).toBeGreaterThan(0);
    });

    it("does not render settings nav link for admin", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      expect(screen.queryByText("settings")).not.toBeInTheDocument();
    });

    it("renders audit log nav link for admin", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("auditLog").length).toBeGreaterThan(0);
    });

    it("renders all postings nav link for admin", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("allPostings").length).toBeGreaterThan(0);
    });

    it("renders employers nav link for admin", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      expect(screen.getAllByText("employers").length).toBeGreaterThan(0);
    });

    it("does not show seeker items for admin role", () => {
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<PortalTopNav />);
      // Admin nav should not have seeker-specific items
      expect(screen.queryByText("myApplications")).not.toBeInTheDocument();
      expect(screen.queryByText("savedJobs")).not.toBeInTheDocument();
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

    it("guest browseAll link points to /en/search (P-4.1B nav update)", () => {
      setGuest();
      render(<PortalTopNav />);
      const browseLinks = screen.getAllByText("browseAll").map((el) => el.closest("a"));
      const searchLinks = browseLinks.filter((l) => l?.getAttribute("href")?.includes("/search"));
      expect(searchLinks.length).toBeGreaterThan(0);
    });

    it("guest discover link points to /en/jobs (P-4.2 nav update)", () => {
      setGuest();
      render(<PortalTopNav />);
      const discoverLinks = screen.getAllByText("discover").map((el) => el.closest("a"));
      const jobsLinks = discoverLinks.filter((l) => l?.getAttribute("href") === "/en/jobs");
      expect(jobsLinks.length).toBeGreaterThan(0);
    });
  });

  describe("logout button", () => {
    it("renders logout button for authenticated users", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<PortalTopNav />);
      expect(screen.getByTestId("logout-button")).toBeInTheDocument();
    });

    it("does not render logout button for guests", () => {
      setGuest();
      render(<PortalTopNav />);
      expect(screen.queryByTestId("logout-button")).not.toBeInTheDocument();
    });

    it("calls signOut with community URL on click", () => {
      setSession({ user: { activePortalRole: "EMPLOYER", portalRoles: ["EMPLOYER"] } });
      render(<PortalTopNav />);
      fireEvent.click(screen.getByTestId("logout-button"));
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "http://localhost:3000" });
    });
  });

  describe("Back to Community link", () => {
    it("is always visible (for seeker)", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<PortalTopNav />);
      const links = screen.getAllByTestId("back-to-community");
      expect(links.length).toBeGreaterThan(0);
    });

    it("href equals NEXT_PUBLIC_COMMUNITY_URL", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
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
