// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupCard } from "./GroupCard";
import type { DirectoryGroupItem } from "@igbo/db/queries/groups";
import { expectNoA11yViolations } from "@/test/a11y-utils";

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

const mockGroup: DirectoryGroupItem = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "London Chapter",
  description: "For Igbo diaspora in London",
  bannerUrl: null,
  visibility: "public",
  joinType: "open",
  memberCount: 42,
  memberLimit: null,
  creatorId: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-03-01T10:00:00.000Z",
};

describe("GroupCard", () => {
  it("renders group name", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByText("London Chapter")).toBeInTheDocument();
  });

  it("renders member count", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByText(/memberCount/)).toBeInTheDocument();
  });

  it("renders visibility badge", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByText("visibilityOptions.public")).toBeInTheDocument();
  });

  it("renders description when present", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByText("For Igbo diaspora in London")).toBeInTheDocument();
  });

  it("does not render description when absent", () => {
    const group: DirectoryGroupItem = { ...mockGroup, description: null };
    render(<GroupCard group={group} viewerMembership={null} />);
    expect(screen.queryByText("For Igbo diaspora in London")).not.toBeInTheDocument();
  });

  it("renders placeholder banner letter when no bannerUrl", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("renders banner image when bannerUrl provided", () => {
    const group: DirectoryGroupItem = {
      ...mockGroup,
      bannerUrl: "https://example.com/banner.jpg",
    };
    render(<GroupCard group={group} viewerMembership={null} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/banner.jpg");
  });

  it("links to the group detail page", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/groups/${mockGroup.id}`);
  });

  // ── Button states ──────────────────────────────────────────────────────────

  it("shows Join button when not a member and open group", () => {
    render(<GroupCard group={mockGroup} viewerMembership={null} />);
    expect(screen.getByRole("button", { name: "joinButton" })).toBeInTheDocument();
  });

  it("shows Request to Join button when not a member and private group", () => {
    const group = { ...mockGroup, joinType: "approval" as const, visibility: "private" as const };
    render(<GroupCard group={group} viewerMembership={null} />);
    expect(screen.getByRole("button", { name: "requestToJoin" })).toBeInTheDocument();
  });

  it("shows Joined badge when active member", () => {
    render(<GroupCard group={mockGroup} viewerMembership={{ role: "member", status: "active" }} />);
    expect(screen.getByText("joined")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Pending badge when pending member", () => {
    render(
      <GroupCard group={mockGroup} viewerMembership={{ role: "member", status: "pending" }} />,
    );
    expect(screen.getByText("pendingRequest")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Group is full when member limit reached", () => {
    const group = { ...mockGroup, memberLimit: 42, memberCount: 42 };
    render(<GroupCard group={group} viewerMembership={null} />);
    expect(screen.getByText("groupFull")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onJoin with stopPropagation on Join click", async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(<GroupCard group={mockGroup} viewerMembership={null} onJoin={onJoin} />);

    const button = screen.getByRole("button", { name: "joinButton" });
    fireEvent.click(button);

    expect(onJoin).toHaveBeenCalledWith(mockGroup.id);
  });

  it("calls onRequestJoin on Request to Join click", async () => {
    const onRequestJoin = vi.fn().mockResolvedValue(undefined);
    const group = { ...mockGroup, joinType: "approval" as const };
    render(<GroupCard group={group} viewerMembership={null} onRequestJoin={onRequestJoin} />);

    const button = screen.getByRole("button", { name: "requestToJoin" });
    fireEvent.click(button);

    expect(onRequestJoin).toHaveBeenCalledWith(mockGroup.id);
  });

  it("shows error message when join fails", async () => {
    const onJoin = vi.fn().mockRejectedValue(new Error("Group is full"));
    render(<GroupCard group={mockGroup} viewerMembership={null} onJoin={onJoin} />);

    const button = screen.getByRole("button", { name: "joinButton" });
    fireEvent.click(button);

    // Wait for async rejection
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Group is full");
  });

  it("shows fallback error message when join fails without message", async () => {
    const onJoin = vi.fn().mockRejectedValue("unexpected error");
    render(<GroupCard group={mockGroup} viewerMembership={null} onJoin={onJoin} />);

    const button = screen.getByRole("button", { name: "joinButton" });
    fireEvent.click(button);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("errors.fetchFailed");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<GroupCard group={mockGroup} viewerMembership={null} />);
    await expectNoA11yViolations(container);
  });
});
