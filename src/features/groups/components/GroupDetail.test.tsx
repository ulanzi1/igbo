// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Tabs mock: always renders all content (simulates click-to-switch via value state)
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="tabs" data-value={value} onClick={() => {}}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({
    value,
    children,
    onClick,
  }: {
    value: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button role="tab" data-value={value} onClick={onClick}>
      {children}
    </button>
  ),
  TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

vi.mock("./GroupFeedTab", () => ({
  GroupFeedTab: ({ groupId }: { groupId: string }) => (
    <div data-testid="group-feed-tab">GroupFeedTab:{groupId}</div>
  ),
}));

vi.mock("./GroupChannelsTab", () => ({
  GroupChannelsTab: ({ groupId }: { groupId: string }) => (
    <div data-testid="group-channels-tab">GroupChannelsTab:{groupId}</div>
  ),
}));

vi.mock("./GroupMembersTab", () => ({
  GroupMembersTab: ({ groupId }: { groupId: string }) => (
    <div data-testid="group-members-tab">GroupMembersTab:{groupId}</div>
  ),
}));

vi.mock("./GroupFilesTab", () => ({
  GroupFilesTab: ({ groupId }: { groupId: string }) => (
    <div data-testid="group-files-tab">GroupFilesTab:{groupId}</div>
  ),
}));

import { GroupDetail } from "./GroupDetail";

const GROUP_ID = "00000000-0000-4000-8000-000000000001";

const makeGroup = (overrides = {}) => ({
  id: GROUP_ID,
  name: "Test Group",
  description: "A test group",
  visibility: "public" as const,
  joinType: "open" as const,
  postingPermission: "all_members" as const,
  commentingPermission: "open" as const,
  bannerUrl: null,
  memberLimit: null,
  memberCount: 5,
  creatorId: "user-1",
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const VIEWER_ID = "00000000-0000-4000-8000-000000000002";
const ACTIVE_MEMBERSHIP = { role: "member" as const, status: "active" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GroupDetail", () => {
  it("renders all 4 tab triggers", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByText("tabs.feed")).toBeInTheDocument();
    expect(screen.getByText("tabs.channels")).toBeInTheDocument();
    expect(screen.getByText("tabs.members")).toBeInTheDocument();
    expect(screen.getByText("tabs.files")).toBeInTheDocument();
  });

  it("renders GroupFeedTab in the feed tab content", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByTestId("group-feed-tab")).toBeInTheDocument();
    expect(screen.getByText(`GroupFeedTab:${GROUP_ID}`)).toBeInTheDocument();
  });

  it("renders GroupChannelsTab for active member in channels tab", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByTestId("group-channels-tab")).toBeInTheDocument();
    expect(screen.getByText(`GroupChannelsTab:${GROUP_ID}`)).toBeInTheDocument();
  });

  it("shows join message for non-member in channels tab", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={null}
        viewerId={VIEWER_ID}
        viewerDisplayName="Guest"
      />,
    );

    // GroupChannelsTab should NOT be rendered
    expect(screen.queryByTestId("group-channels-tab")).not.toBeInTheDocument();
    expect(screen.getByText("requiresMembership")).toBeInTheDocument();
  });

  it("shows join message for non-member in files tab", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={null}
        viewerId={VIEWER_ID}
        viewerDisplayName="Guest"
      />,
    );

    expect(screen.queryByTestId("group-files-tab")).not.toBeInTheDocument();
    expect(screen.getByText("requiresMembershipFiles")).toBeInTheDocument();
  });

  it("renders GroupFilesTab for active member in files tab", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByTestId("group-files-tab")).toBeInTheDocument();
  });

  it("always renders GroupMembersTab regardless of membership", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={null}
        viewerId={VIEWER_ID}
        viewerDisplayName="Guest"
      />,
    );

    expect(screen.getByTestId("group-members-tab")).toBeInTheDocument();
  });

  it("pending member sees join messages for channels and files", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={{ role: "member", status: "pending" }}
        viewerId={VIEWER_ID}
        viewerDisplayName="Pending"
      />,
    );

    expect(screen.queryByTestId("group-channels-tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-files-tab")).not.toBeInTheDocument();
  });
});

describe("GroupDetail — archived group", () => {
  const archivedGroup = makeGroup({ deletedAt: "2026-03-01T00:00:00.000Z" });

  it("shows the archived banner", () => {
    render(
      <GroupDetail
        group={archivedGroup}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByTestId("archived-banner")).toBeInTheDocument();
    expect(screen.getByText("archived.banner")).toBeInTheDocument();
  });

  it("does not show the archived banner for active group", () => {
    render(
      <GroupDetail
        group={makeGroup()}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.queryByTestId("archived-banner")).not.toBeInTheDocument();
  });

  it("only shows Feed and Members tabs for archived group", () => {
    render(
      <GroupDetail
        group={archivedGroup}
        viewerMembership={ACTIVE_MEMBERSHIP}
        viewerId={VIEWER_ID}
        viewerDisplayName="Alice"
      />,
    );

    expect(screen.getByText("tabs.feed")).toBeInTheDocument();
    expect(screen.getByText("tabs.members")).toBeInTheDocument();
    expect(screen.queryByText("tabs.channels")).not.toBeInTheDocument();
    expect(screen.queryByText("tabs.files")).not.toBeInTheDocument();
  });
});
