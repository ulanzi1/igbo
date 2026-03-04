// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupHeader } from "./GroupHeader";
import type { CommunityGroup } from "@/db/schema/community-groups";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    "aria-label"?: string;
  }) => (
    <a href={href} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockFetch.mockReset();
  global.fetch = mockFetch;
  global.confirm = vi.fn(() => true);
});

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const CREATOR_ID = "00000000-0000-4000-8000-000000000002";

const mockGroup: CommunityGroup = {
  id: GROUP_ID,
  name: "London Chapter",
  description: "For Igbo diaspora in London",
  bannerUrl: null,
  visibility: "public",
  joinType: "open",
  postingPermission: "all_members",
  commentingPermission: "open",
  memberLimit: null,
  creatorId: CREATOR_ID,
  memberCount: 42,
  deletedAt: null,
  createdAt: new Date("2026-03-01"),
  updatedAt: new Date("2026-03-01"),
};

describe("GroupHeader", () => {
  it("renders group name", () => {
    render(<GroupHeader group={mockGroup} />);
    expect(screen.getByRole("heading", { name: "London Chapter" })).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<GroupHeader group={mockGroup} />);
    expect(screen.getByText("For Igbo diaspora in London")).toBeInTheDocument();
  });

  it("renders member count", () => {
    render(<GroupHeader group={mockGroup} />);
    expect(screen.getByText(/members/)).toBeInTheDocument();
  });

  it("does not show settings link to regular viewer", () => {
    render(<GroupHeader group={mockGroup} viewerIsCreatorOrLeader={false} />);
    expect(screen.queryByRole("link", { name: /settingsTitle/ })).not.toBeInTheDocument();
  });

  it("shows settings link to creator", () => {
    render(<GroupHeader group={mockGroup} viewerIsCreatorOrLeader />);
    const settingsLink = screen.getByRole("link", { name: /settingsTitle/ });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute("href", `/groups/${GROUP_ID}/settings`);
  });

  it("renders placeholder banner when no bannerUrl", () => {
    render(<GroupHeader group={mockGroup} />);
    // Initial letter "L" for "London Chapter"
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("renders banner image when bannerUrl provided", () => {
    const group: CommunityGroup = { ...mockGroup, bannerUrl: "https://example.com/banner.jpg" };
    render(<GroupHeader group={group} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/banner.jpg");
  });

  it("does not render description when absent", () => {
    const group: CommunityGroup = { ...mockGroup, description: null };
    render(<GroupHeader group={group} />);
    expect(screen.queryByText("For Igbo diaspora in London")).not.toBeInTheDocument();
  });

  describe("Leave Group button", () => {
    it("shows leave button for active non-creator member", () => {
      render(
        <GroupHeader group={mockGroup} viewerMembership={{ role: "member", status: "active" }} />,
      );
      expect(screen.getByRole("button", { name: "leaveGroup" })).toBeInTheDocument();
    });

    it("does not show leave button for creator", () => {
      render(
        <GroupHeader group={mockGroup} viewerMembership={{ role: "creator", status: "active" }} />,
      );
      expect(screen.queryByRole("button", { name: "leaveGroup" })).not.toBeInTheDocument();
    });

    it("does not show leave button when not a member", () => {
      render(<GroupHeader group={mockGroup} viewerMembership={null} />);
      expect(screen.queryByRole("button", { name: "leaveGroup" })).not.toBeInTheDocument();
    });

    it("calls DELETE API and redirects on confirm", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { left: true } }),
      });

      render(
        <GroupHeader group={mockGroup} viewerMembership={{ role: "member", status: "active" }} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "leaveGroup" }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/v1/groups/${GROUP_ID}/members/self`,
          expect.objectContaining({ method: "DELETE" }),
        );
        expect(mockPush).toHaveBeenCalledWith("/groups");
      });
    });

    it("shows error message when leave fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: "Group creators cannot leave." }),
      });

      render(
        <GroupHeader group={mockGroup} viewerMembership={{ role: "member", status: "active" }} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "leaveGroup" }));

      await waitFor(() => {
        expect(screen.getByText("Group creators cannot leave.")).toBeInTheDocument();
      });
    });

    it("does not call API when confirm is cancelled", async () => {
      global.confirm = vi.fn(() => false);

      render(
        <GroupHeader group={mockGroup} viewerMembership={{ role: "member", status: "active" }} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "leaveGroup" }));

      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });
});
