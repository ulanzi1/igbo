// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GroupList } from "./GroupList";
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

vi.mock("@/features/groups/hooks/use-groups", () => ({
  useGroups: vi.fn(),
}));

// Mock GroupCard to avoid nested dependency issues
vi.mock("./GroupCard", () => ({
  GroupCard: ({ group }: { group: GroupListItem }) => (
    <div data-testid="group-card">{group.name}</div>
  ),
}));

import { useGroups } from "@/features/groups/hooks/use-groups";

const mockUseGroups = vi.mocked(useGroups);

const mockGroups: GroupListItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "London Chapter",
    description: null,
    bannerUrl: null,
    visibility: "public",
    joinType: "open",
    memberCount: 10,
    creatorId: "00000000-0000-4000-8000-000000000002",
    createdAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Lagos Connect",
    description: null,
    bannerUrl: null,
    visibility: "public",
    joinType: "open",
    memberCount: 5,
    creatorId: "00000000-0000-4000-8000-000000000002",
    createdAt: "2026-03-01T11:00:00.000Z",
  },
];

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockUseGroups.mockReset();
  mockUseGroups.mockReturnValue({
    data: { groups: mockGroups, nextCursor: null, total: 2 },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useGroups>);
});

describe("GroupList", () => {
  it("renders grid of GroupCard items", () => {
    renderWithClient(<GroupList />);
    const cards = screen.getAllByTestId("group-card");
    expect(cards).toHaveLength(2);
  });

  it("renders group names", () => {
    renderWithClient(<GroupList />);
    expect(screen.getByText("London Chapter")).toBeInTheDocument();
    expect(screen.getByText("Lagos Connect")).toBeInTheDocument();
  });

  it("renders search input", () => {
    renderWithClient(<GroupList />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("shows Create Group button for canCreateGroup=true", () => {
    renderWithClient(<GroupList canCreateGroup />);
    expect(screen.getAllByText("createGroup").length).toBeGreaterThan(0);
  });

  it("hides Create Group button for canCreateGroup=false (default)", () => {
    renderWithClient(<GroupList canCreateGroup={false} />);
    expect(screen.queryByText("createGroup")).not.toBeInTheDocument();
  });

  it("renders empty state when no groups", () => {
    mockUseGroups.mockReturnValue({
      data: { groups: [], nextCursor: null, total: 0 },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGroups>);

    renderWithClient(<GroupList />);
    expect(screen.getByText("noGroups")).toBeInTheDocument();
    expect(screen.getByText("noGroupsHint")).toBeInTheDocument();
  });

  it("renders loading skeletons while loading", () => {
    mockUseGroups.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useGroups>);

    renderWithClient(<GroupList />);
    expect(screen.queryAllByTestId("group-card")).toHaveLength(0);
  });
});
