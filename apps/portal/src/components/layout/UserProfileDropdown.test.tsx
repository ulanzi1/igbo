// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Avatar mock: Radix AvatarImage never fires load in jsdom — mock to render directly
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar">{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt ?? ""} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

import { useSession } from "next-auth/react";
import { UserProfileDropdown } from "./UserProfileDropdown";

// Radix DropdownMenu needs pointer capture polyfills in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_COMMUNITY_URL = "http://localhost:3000";
});

describe("UserProfileDropdown", () => {
  describe("avatar trigger", () => {
    it("renders avatar trigger button", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      expect(screen.getByTestId("user-profile-trigger")).toBeInTheDocument();
    });

    it("trigger has aria-label from i18n", () => {
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      expect(screen.getByTestId("user-profile-trigger")).toHaveAttribute(
        "aria-label",
        "userMenuAriaLabel",
      );
    });

    it("renders initials fallback when no image", () => {
      setSession({
        user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"], image: null },
      });
      render(<UserProfileDropdown />);
      // "Test User" → initials "TU"
      expect(screen.getByText("TU")).toBeInTheDocument();
    });

    it("renders image when session has image", () => {
      setSession({
        user: {
          activePortalRole: "JOB_SEEKER",
          portalRoles: ["JOB_SEEKER"],
          image: "https://example.com/avatar.png",
        },
      });
      render(<UserProfileDropdown />);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    });
  });

  describe("dropdown content", () => {
    it("shows user name when dropdown opens", async () => {
      const user = userEvent.setup();
      setSession({
        user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"], name: "Ada Obi" },
      });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("user-menu-name")).toHaveTextContent("Ada Obi");
    });

    it("shows profile link for JOB_SEEKER pointing to /en/profile", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("profile-link")).toHaveAttribute("href", "/en/profile");
    });

    it("shows company-profile link for EMPLOYER", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "EMPLOYER", portalRoles: ["EMPLOYER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("profile-link")).toHaveAttribute("href", "/en/company-profile");
    });

    it("shows notification settings link for JOB_SEEKER", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("notification-settings-link")).toHaveAttribute(
        "href",
        "/en/settings/notifications",
      );
    });

    it("shows notification settings link for EMPLOYER", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "EMPLOYER", portalRoles: ["EMPLOYER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("notification-settings-link")).toHaveAttribute(
        "href",
        "/en/settings/notifications",
      );
    });

    it("does not show notification settings link for JOB_ADMIN", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.queryByTestId("notification-settings-link")).not.toBeInTheDocument();
    });

    it("does not show profile link for JOB_ADMIN", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_ADMIN", portalRoles: ["JOB_ADMIN"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.queryByTestId("profile-link")).not.toBeInTheDocument();
    });

    it("shows logout item in dropdown", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      expect(screen.getByTestId("dropdown-logout")).toBeInTheDocument();
    });

    it("calls signOut with community URL when logout item is clicked", async () => {
      const user = userEvent.setup();
      setSession({ user: { activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] } });
      render(<UserProfileDropdown />);
      await user.click(screen.getByTestId("user-profile-trigger"));
      await user.click(screen.getByTestId("dropdown-logout"));
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "http://localhost:3000" });
    });
  });
});
