// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupSettings } from "./GroupSettings";
import type { CommunityGroup } from "@/db/schema/community-groups";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const CREATOR_ID = "00000000-0000-4000-8000-000000000002";

const mockGroup: CommunityGroup = {
  id: GROUP_ID,
  name: "London Chapter",
  description: "For Igbo diaspora",
  bannerUrl: null,
  visibility: "public",
  joinType: "open",
  postingPermission: "all_members",
  commentingPermission: "open",
  memberLimit: null,
  creatorId: CREATOR_ID,
  memberCount: 10,
  deletedAt: null,
  createdAt: new Date("2026-03-01"),
  updatedAt: new Date("2026-03-01"),
};

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: { group: { ...mockGroup } } }),
  });
});

describe("GroupSettings", () => {
  describe("when viewerIsCreatorOrLeader=false", () => {
    it("renders nothing", () => {
      const { container } = render(
        <GroupSettings group={mockGroup} viewerIsCreatorOrLeader={false} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("when viewerIsCreatorOrLeader=true", () => {
    it("renders settings form with pre-filled values", () => {
      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      expect(screen.getByDisplayValue("London Chapter")).toBeInTheDocument();
      expect(screen.getByDisplayValue("For Igbo diaspora")).toBeInTheDocument();
    });

    it("renders settings heading", () => {
      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      expect(screen.getByText("settingsTitle")).toBeInTheDocument();
    });

    it("calls PATCH API on submit", async () => {
      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      const form = screen.getByText("settingsSaveButton").closest("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/v1/groups/${GROUP_ID}`,
          expect.objectContaining({ method: "PATCH" }),
        );
      });
    });

    it("shows success message after successful save", async () => {
      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      const form = screen.getByText("settingsSaveButton").closest("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("settingsSaved");
      });
    });

    it("shows error message when PATCH returns non-ok", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: "Not authorized" }),
      });

      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      const form = screen.getByText("settingsSaveButton").closest("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Not authorized");
      });
    });

    it("allows changing name", () => {
      render(<GroupSettings group={mockGroup} viewerIsCreatorOrLeader />);
      const nameInput = screen.getByDisplayValue("London Chapter");
      fireEvent.change(nameInput, { target: { value: "Updated Name" } });
      expect(nameInput).toHaveValue("Updated Name");
    });
  });

  describe("PendingRequestsSection", () => {
    const approvalGroup: CommunityGroup = { ...mockGroup, joinType: "approval" };
    const MEMBER_ID = "00000000-0000-4000-8000-000000000099";

    it("renders pending requests above the settings heading", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pendingRequests: [
                { userId: MEMBER_ID, displayName: "Chidi Okeke", joinedAt: "2026-03-01T00:00:00Z" },
              ],
            },
          }),
      });

      render(<GroupSettings group={approvalGroup} viewerIsCreatorOrLeader />);

      await waitFor(() => {
        expect(screen.getByTestId("pending-requests-section")).toBeInTheDocument();
      });

      // Pending Requests section should appear before the settings heading in the DOM
      const container = screen.getByTestId("pending-requests-section").closest("div");
      const heading = screen.getByText("settingsTitle");
      expect(
        container!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("renders member display name as a profile link", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pendingRequests: [
                { userId: MEMBER_ID, displayName: "Chidi Okeke", joinedAt: "2026-03-01T00:00:00Z" },
              ],
            },
          }),
      });

      render(<GroupSettings group={approvalGroup} viewerIsCreatorOrLeader />);

      await waitFor(() => {
        const link = screen.getByRole("link", { name: "Chidi Okeke" });
        expect(link).toHaveAttribute("href", `/profiles/${MEMBER_ID}`);
      });
    });

    it("falls back to userId in link text when displayName is null", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pendingRequests: [
                { userId: MEMBER_ID, displayName: null, joinedAt: "2026-03-01T00:00:00Z" },
              ],
            },
          }),
      });

      render(<GroupSettings group={approvalGroup} viewerIsCreatorOrLeader />);

      await waitFor(() => {
        const link = screen.getByRole("link", { name: MEMBER_ID });
        expect(link).toHaveAttribute("href", `/profiles/${MEMBER_ID}`);
      });
    });
  });
});
