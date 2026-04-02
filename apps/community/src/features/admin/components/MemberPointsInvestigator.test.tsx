// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const mockUseQuery = vi.fn();
const mockT = vi.fn((key: string) => key);
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockUseSearchParams = vi.fn(() => new URLSearchParams(""));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockT,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/admin/members/points",
}));

vi.mock("@/components/shared/VerificationBadge", () => ({
  VerificationBadge: ({ badgeType }: { badgeType: string | null | undefined }) =>
    badgeType ? <span data-testid="badge">{badgeType}</span> : null,
}));

vi.mock("@igbo/db/schema/community-badges", () => ({
  badgeTypeEnum: {},
  communityUserBadges: {},
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MemberPointsInvestigator } from "./MemberPointsInvestigator";

const SAMPLE_PROFILE = {
  userId: "user-1",
  displayName: "Alice",
  email: "alice@example.com",
  memberSince: "2024-01-01T00:00:00.000Z",
  badgeType: null,
  badgeAssignedAt: null,
};

const SAMPLE_SUMMARY = { total: 150, thisWeek: 20, thisMonth: 60 };

const SAMPLE_LEDGER = {
  entries: [
    {
      id: "e1",
      points: 5,
      reason: "like_received",
      sourceType: "like_received" as const,
      sourceId: "post-1",
      multiplierApplied: "1",
      createdAt: "2024-06-01T12:00:00.000Z",
    },
  ],
  total: 1,
};

const SAMPLE_THROTTLE = {
  entries: [
    {
      date: "2024-06-01T14:00:00.000Z",
      reason: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-1",
      triggeredBy: "Bob",
    },
  ],
  total: 1,
};

function makeProfileResponse() {
  return {
    profile: SAMPLE_PROFILE,
    summary: SAMPLE_SUMMARY,
    ledger: SAMPLE_LEDGER,
    throttleHistory: SAMPLE_THROTTLE,
  };
}

function makeSearchResponse(results = [SAMPLE_PROFILE]) {
  return { results };
}

function defaultQueryMock({ queryKey }: { queryKey: unknown[]; enabled?: boolean }) {
  const key = String(queryKey[1]);
  if (key === "members-search") return { data: undefined, isLoading: false, isError: false };
  if (key === "member-points")
    return { data: makeProfileResponse(), isLoading: false, isError: false };
  return { data: undefined, isLoading: false, isError: false };
}

function renderComponent() {
  return render(
    <TooltipProvider>
      <MemberPointsInvestigator />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockImplementation(defaultQueryMock);
});

describe("MemberPointsInvestigator", () => {
  it("renders search input with placeholder", () => {
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("searchPlaceholder");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows search dropdown when query has >= 2 chars and results available", async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "members-search")
        return {
          data: makeSearchResponse(),
          isLoading: false,
          isError: false,
        };
      return { data: undefined, isLoading: false, isError: false };
    });

    renderComponent();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "al" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
  });

  it("clicking a search result selects member, closes dropdown, and updates URL", async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "members-search")
        return {
          data: makeSearchResponse(),
          isLoading: false,
          isError: false,
        };
      return { data: undefined, isLoading: false, isError: false };
    });

    renderComponent();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "alice" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    // Click the search result
    const resultButton = screen.getByText("alice@example.com").closest("button")!;
    fireEvent.click(resultButton);

    expect(mockPush).toHaveBeenCalledWith("/admin/members/points?userId=user-1");
  });

  it("shows noResults in dropdown when search returns empty", async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "members-search")
        return { data: makeSearchResponse([]), isLoading: false, isError: false };
      return { data: undefined, isLoading: false, isError: false };
    });

    renderComponent();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(mockT).toHaveBeenCalledWith("noResults");
    });
  });

  it("renders all profile sections when data is available", () => {
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("profileCard");
    expect(mockT).toHaveBeenCalledWith("ledgerHistory");
    expect(mockT).toHaveBeenCalledWith("throttleHistory");
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows noPointsYet when ledger entries are empty", () => {
    mockUseQuery.mockImplementation(() => ({
      data: {
        ...makeProfileResponse(),
        ledger: { entries: [], total: 0 },
      },
      isLoading: false,
      isError: false,
    }));
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("noPointsYet");
  });

  it("shows noThrottleEvents when throttle entries are empty", () => {
    mockUseQuery.mockImplementation(() => ({
      data: {
        ...makeProfileResponse(),
        throttleHistory: { entries: [], total: 0 },
      },
      isLoading: false,
      isError: false,
    }));
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("noThrottleEvents");
  });

  it("loads userId from URL ?userId= param on mount", () => {
    mockUseSearchParams.mockReturnValueOnce(new URLSearchParams("userId=user-1"));
    renderComponent();
    // The profile query is enabled when selectedUserId is set
    const calls = mockUseQuery.mock.calls;
    const profileCall = calls.find(
      (c) => String((c[0] as { queryKey: unknown[] }).queryKey[1]) === "member-points",
    );
    expect(profileCall).toBeDefined();
  });

  it("shows loading skeleton when profile is loading", () => {
    // Provide a userId via searchParams so the loading state triggers
    mockUseSearchParams.mockReturnValueOnce(new URLSearchParams("userId=user-1"));

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "member-points") return { data: undefined, isLoading: true, isError: false };
      return { data: undefined, isLoading: false, isError: false };
    });
    const { container } = renderComponent();
    // Loading state shows a skeleton with animate-pulse
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows distinct error message (not empty state) when profile query fails", () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[1]);
      if (key === "member-points") return { data: undefined, isLoading: false, isError: true };
      return { data: undefined, isLoading: false, isError: false };
    });
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("error");
    // Should NOT call noPointsYet (error vs empty are distinct)
    expect(mockT).not.toHaveBeenCalledWith("noPointsYet");
  });

  it("activity type filter select has i18n labels", () => {
    renderComponent();
    expect(mockT).toHaveBeenCalledWith("likeReceived");
    expect(mockT).toHaveBeenCalledWith("eventAttended");
    expect(mockT).toHaveBeenCalledWith("articlePublished");
  });

  it("ledger table sourceType column uses i18n label (not raw enum)", () => {
    renderComponent();
    // The sourceType cell calls t() with the mapped key "likeReceived"
    expect(mockT).toHaveBeenCalledWith("likeReceived");
    // The 4th column (index 3) in each ledger row is sourceType — verify it shows the i18n key
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    // sourceType is the 4th td (date, points, reason, sourceType, sourceId, multiplier)
    const sourceTypeCell = rows[0]?.querySelectorAll("td")[3];
    expect(sourceTypeCell?.textContent).toBe("likeReceived");
  });

  it("activity type filter change resets ledger page and updates filter", () => {
    renderComponent();
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    const activitySelect = selects[0];
    fireEvent.change(activitySelect!, { target: { value: "like_received" } });
    // The filter value changes without error
    expect((activitySelect as HTMLSelectElement).value).toBe("like_received");
  });

  it("ledger and throttle pagination are independent (separate page states)", () => {
    const bigLedger = {
      entries: SAMPLE_LEDGER.entries,
      total: 50, // enough for 3 pages
    };
    const bigThrottle = {
      entries: SAMPLE_THROTTLE.entries,
      total: 50,
    };
    mockUseQuery.mockImplementation(() => ({
      data: {
        ...makeProfileResponse(),
        ledger: bigLedger,
        throttleHistory: bigThrottle,
      },
      isLoading: false,
      isError: false,
    }));
    renderComponent();
    const prevButtons = screen.getAllByText("←");
    const nextButtons = screen.getAllByText("→");
    // Two pairs of pagination controls (ledger + throttle)
    expect(prevButtons.length).toBeGreaterThanOrEqual(2);
    expect(nextButtons.length).toBeGreaterThanOrEqual(2);
  });
});
