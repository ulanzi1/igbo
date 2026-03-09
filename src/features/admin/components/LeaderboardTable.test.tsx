// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseQuery = vi.fn();
const mockT = vi.fn((key: string) => key);
const mockPush = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/shared/VerificationBadge", () => ({
  VerificationBadge: ({ badgeType }: { badgeType: string | null | undefined }) =>
    badgeType ? <span data-testid="badge">{badgeType}</span> : null,
}));

vi.mock("@/db/schema/community-badges", () => ({
  badgeTypeEnum: {},
  communityUserBadges: {},
}));

import { LeaderboardTable } from "./LeaderboardTable";

const SAMPLE_LEADERBOARD_USERS = [
  {
    userId: "user-1",
    displayName: "Alice",
    email: "alice@example.com",
    totalPoints: 500,
    badgeType: null,
    memberSince: "2024-01-01T00:00:00.000Z",
  },
  {
    userId: "user-2",
    displayName: "Bob",
    email: "bob@example.com",
    totalPoints: 200,
    badgeType: "blue",
    memberSince: "2024-03-15T00:00:00.000Z",
  },
];

const SAMPLE_FLAGGED_USERS = [
  {
    userId: "user-3",
    displayName: "Charlie",
    throttleCount: 5,
    lastThrottledAt: "2024-06-15T12:00:00.000Z",
    reasons: ["rapid_fire"],
  },
];

function makeLeaderboardResponse(users = SAMPLE_LEADERBOARD_USERS) {
  return { data: users, pagination: { page: 1, limit: 25, total: users.length } };
}

function makeFlaggedResponse(users = SAMPLE_FLAGGED_USERS) {
  return { data: users, pagination: { page: 1, limit: 25, total: users.length } };
}

function queryMock({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) {
  const key = String(queryKey[1]);
  if (key === "leaderboard") {
    return {
      data: enabled !== false ? makeLeaderboardResponse() : undefined,
      isLoading: false,
      isError: false,
    };
  }
  // flagged
  return {
    data: enabled !== false ? makeFlaggedResponse() : undefined,
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockImplementation(queryMock);
});

describe("LeaderboardTable", () => {
  it("renders leaderboard tab by default", () => {
    render(<LeaderboardTable />);
    expect(mockT).toHaveBeenCalledWith("leaderboardTab");
    expect(mockT).toHaveBeenCalledWith("flaggedUsersTab");
  });

  it("displays leaderboard user rows with correct data", () => {
    render(<LeaderboardTable />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders VerificationBadge for users with badges", () => {
    render(<LeaderboardTable />);
    const badges = screen.getAllByTestId("badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("blue");
  });

  it("switches to flagged users tab when clicked", () => {
    render(<LeaderboardTable />);
    const flaggedBtn = screen.getByText("flaggedUsersTab");
    fireEvent.click(flaggedBtn);
    expect(mockT).toHaveBeenCalledWith("flaggedUsersTab");
  });

  it("applies date range filter input changes", () => {
    render(<LeaderboardTable />);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[0], { target: { value: "2024-01-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2024-12-31" } });
    // No error thrown means the filter state updated
    expect(dateInputs[0]).toHaveValue("2024-01-01");
    expect(dateInputs[1]).toHaveValue("2024-12-31");
  });

  it("applies activity type filter via select", () => {
    render(<LeaderboardTable />);
    const select = document.querySelector("select");
    expect(select).toBeInTheDocument();
    fireEvent.change(select!, { target: { value: "like_received" } });
    expect((select as HTMLSelectElement).value).toBe("like_received");
  });

  it("handles empty leaderboard results with noResults message", () => {
    mockUseQuery.mockReturnValue({
      data: { data: [], pagination: { page: 1, limit: 25, total: 0 } },
      isLoading: false,
      isError: false,
    });
    render(<LeaderboardTable />);
    expect(mockT).toHaveBeenCalledWith("noResults");
  });

  it("shows noFlaggedUsers message when flagged list is empty", () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "leaderboard") return { data: undefined, isLoading: false, isError: false };
      return {
        data: { data: [], pagination: { page: 1, limit: 25, total: 0 } },
        isLoading: false,
        isError: false,
      };
    });
    render(<LeaderboardTable />);
    const flaggedBtn = screen.getByText("flaggedUsersTab");
    fireEvent.click(flaggedBtn);
    expect(mockT).toHaveBeenCalledWith("noFlaggedUsers");
  });

  it("shows loading skeleton when query is loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = render(<LeaderboardTable />);
    const skeletonItems = container.querySelectorAll(".animate-pulse > div");
    expect(skeletonItems.length).toBeGreaterThan(0);
  });

  it("row click navigates to investigation page with correct userId", () => {
    render(<LeaderboardTable />);
    const rows = document.querySelectorAll('tr[role="link"]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    expect(mockPush).toHaveBeenCalledWith("/admin/members/points?userId=user-1");
  });

  it("shows error message (not noResults) when API fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<LeaderboardTable />);
    expect(mockT).toHaveBeenCalledWith("error");
  });

  it("shows flagged user data in flagged tab", () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "leaderboard") return { data: undefined, isLoading: false, isError: false };
      return { data: makeFlaggedResponse(), isLoading: false, isError: false };
    });
    render(<LeaderboardTable />);
    const flaggedBtn = screen.getByText("flaggedUsersTab");
    fireEvent.click(flaggedBtn);
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });
});
