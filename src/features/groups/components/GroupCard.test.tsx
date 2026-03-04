// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroupCard } from "./GroupCard";
import type { GroupListItem } from "@/db/queries/groups";

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

const mockGroup: GroupListItem = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "London Chapter",
  description: "For Igbo diaspora in London",
  bannerUrl: null,
  visibility: "public",
  joinType: "open",
  memberCount: 42,
  creatorId: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-03-01T10:00:00.000Z",
};

describe("GroupCard", () => {
  it("renders group name", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText("London Chapter")).toBeInTheDocument();
  });

  it("renders member count", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText(/members/)).toBeInTheDocument();
  });

  it("renders visibility badge", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText("visibilityOptions.public")).toBeInTheDocument();
  });

  it("renders description when present", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText("For Igbo diaspora in London")).toBeInTheDocument();
  });

  it("does not render description when absent", () => {
    const group: GroupListItem = { ...mockGroup, description: null };
    render(<GroupCard group={group} />);
    expect(screen.queryByText("For Igbo diaspora in London")).not.toBeInTheDocument();
  });

  it("renders placeholder banner letter when no bannerUrl", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("renders banner image when bannerUrl provided", () => {
    const group: GroupListItem = { ...mockGroup, bannerUrl: "https://example.com/banner.jpg" };
    render(<GroupCard group={group} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/banner.jpg");
  });

  it("renders join button placeholder text via i18n", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByText("joinButton")).toBeInTheDocument();
  });

  it("renders the article element", () => {
    render(<GroupCard group={mockGroup} />);
    expect(screen.getByTestId("group-card")).toBeInTheDocument();
  });

  it("links to the group detail page", () => {
    render(<GroupCard group={mockGroup} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/groups/${mockGroup.id}`);
  });
});
