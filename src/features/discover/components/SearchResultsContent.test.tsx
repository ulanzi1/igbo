// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

const mockUseGlobalSearch = vi.fn();
const mockUseFilteredSearch = vi.fn();
const mockPush = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../hooks/use-global-search", () => ({
  useGlobalSearch: (...args: unknown[]) => mockUseGlobalSearch(...args),
  useFilteredSearch: (...args: unknown[]) => mockUseFilteredSearch(...args),
}));

import { SearchResultsContent } from "./SearchResultsContent";

function defaultSearch(overrides = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    enabled: false,
    isDeferred: false,
    ...overrides,
  };
}

function defaultFilteredSearch(overrides = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    enabled: false,
    isDeferred: false,
    allItems: [],
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

function renderPage(initialQuery = "", initialType?: string) {
  return render(React.createElement(SearchResultsContent, { initialQuery, initialType }));
}

const MEMBER_SECTION = {
  type: "members",
  items: [
    {
      id: "u1",
      type: "members",
      title: "Alice Obi",
      subtitle: "Lagos",
      imageUrl: null,
      href: "/profiles/u1",
      rank: 0.9,
    },
  ],
  hasMore: false,
};

const EVENT_SECTION = {
  type: "events",
  items: [
    {
      id: "e1",
      type: "events",
      title: "Igbo Festival",
      subtitle: "Annual festival",
      imageUrl: null,
      href: "/events/e1",
      rank: 0.7,
    },
  ],
  hasMore: true,
};

const FILTERED_MEMBER_ITEM = {
  id: "u2",
  type: "members",
  title: "Bob Eze",
  subtitle: "Abuja",
  imageUrl: null,
  href: "/profiles/u2",
  rank: 0.8,
  highlight: "<mark>Bob</mark> Eze community member",
};

// IntersectionObserver is not available in jsdom
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
// Must use function syntax — vitest warns if arrow function is used for class-like mocks
global.IntersectionObserver = vi.fn(function MockIntersectionObserver() {
  return { observe: mockObserve, unobserve: vi.fn(), disconnect: mockDisconnect };
}) as unknown as typeof IntersectionObserver;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGlobalSearch.mockReturnValue(defaultSearch());
  mockUseFilteredSearch.mockReturnValue(defaultFilteredSearch());
});

// ── Overview mode: existing regression tests ──────────────────────────────────

describe("SearchResultsContent — loading", () => {
  it("renders skeleton when isLoading (overview)", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ isLoading: true, enabled: true }));
    renderPage("igbo");
    expect(document.querySelector("[aria-busy='true']")).toBeDefined();
  });
});

describe("SearchResultsContent — error state", () => {
  it("shows error message when isError (overview)", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ isError: true, enabled: true }));
    renderPage("igbo");
    expect(screen.getByText("errorTitle")).toBeDefined();
    expect(screen.getByText("errorHint")).toBeDefined();
  });
});

describe("SearchResultsContent — results (overview)", () => {
  it("renders result sections with items", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [MEMBER_SECTION, EVENT_SECTION],
          pageInfo: { hasNextPage: true, cursor: null, nextCursor: null },
        },
      }),
    );
    renderPage("igbo");
    expect(screen.getByText("Alice Obi")).toBeDefined();
    expect(screen.getByText("Igbo Festival")).toBeDefined();
  });

  it("renders 'See all' button for sections with hasMore", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [EVENT_SECTION],
          pageInfo: { hasNextPage: true, cursor: null, nextCursor: null },
        },
      }),
    );
    renderPage("igbo");
    expect(screen.getByText(/seeAll/i)).toBeDefined();
  });

  it("does NOT render 'See all' for sections without hasMore", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [MEMBER_SECTION],
          pageInfo: { hasNextPage: false, cursor: null, nextCursor: null },
        },
      }),
    );
    renderPage("igbo");
    expect(screen.queryByText(/seeAll/i)).toBeNull();
  });

  it("shows results heading with query", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [MEMBER_SECTION],
          pageInfo: { hasNextPage: false, cursor: null, nextCursor: null },
        },
      }),
    );
    renderPage("igbo");
    expect(screen.getByText(/resultsPage.title/i)).toBeDefined();
  });
});

describe("SearchResultsContent — empty state (overview)", () => {
  it("shows no-results message when data is empty", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: { sections: [], pageInfo: {} },
      }),
    );
    renderPage("zzz");
    expect(
      screen.getByText(
        (text) => text.startsWith("noResults:") && !text.startsWith("noResultsHint:"),
      ),
    ).toBeDefined();
  });

  it("shows minChars hint when query is too short", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ enabled: false }));
    renderPage("ab");
    expect(screen.getByText("minChars")).toBeDefined();
  });
});

describe("SearchResultsContent — See All navigation", () => {
  it("navigates to filtered search when See All is clicked", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [EVENT_SECTION],
          pageInfo: { hasNextPage: true, cursor: null, nextCursor: null },
        },
      }),
    );
    renderPage("igbo");
    const seeAllBtn = screen.getByText(/seeAll/i);
    fireEvent.click(seeAllBtn);
    expect(mockPush).toHaveBeenCalled();
  });
});

describe("SearchResultsContent — result item links (overview)", () => {
  it("renders item as link to correct href", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: { sections: [MEMBER_SECTION], pageInfo: {} },
      }),
    );
    renderPage("alice");
    const link = screen.getByRole("link", { name: /Alice Obi/i });
    expect(link.getAttribute("href")).toBe("/profiles/u1");
  });
});

// ── Filtered mode tests ───────────────────────────────────────────────────────

describe("SearchResultsContent — filtered mode", () => {
  it("renders filter bar when type is specified", () => {
    mockUseFilteredSearch.mockReturnValue(defaultFilteredSearch({ enabled: true, allItems: [] }));
    renderPage("igbo", "members");
    // Filter bar is rendered (contains filter label)
    expect(screen.getByText("filters.label")).toBeDefined();
  });

  it("renders active filter chips when filters are present", () => {
    mockUseFilteredSearch.mockReturnValue(defaultFilteredSearch({ enabled: true, allItems: [] }));
    render(
      React.createElement(SearchResultsContent, {
        initialQuery: "igbo",
        initialType: "members",
        initialFilters: { membershipTier: "BASIC" },
      }),
    );
    // chip label rendered via t("filters.membershipTierOptions.BASIC")
    // also appears in the select option — use getAllByText and check at least one exists
    expect(screen.getAllByText("filters.membershipTierOptions.BASIC").length).toBeGreaterThan(0);
  });

  it("renders items from filtered search allItems", () => {
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({
        enabled: true,
        allItems: [FILTERED_MEMBER_ITEM],
      }),
    );
    renderPage("bob", "members");
    expect(screen.getByText("Bob Eze")).toBeDefined();
  });

  it("uses useFilteredSearch hook in filtered mode", () => {
    renderPage("igbo", "posts");
    expect(mockUseFilteredSearch).toHaveBeenCalledWith(expect.objectContaining({ type: "posts" }));
  });

  it("uses useGlobalSearch hook in overview mode", () => {
    renderPage("igbo");
    expect(mockUseGlobalSearch).toHaveBeenCalledWith("igbo");
  });

  it("renders loading skeleton in filtered mode when isLoading", () => {
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({ isLoading: true, enabled: true }),
    );
    renderPage("igbo", "members");
    expect(document.querySelector("[aria-busy='true']")).toBeDefined();
  });

  it("shows error state in filtered mode when isError", () => {
    mockUseFilteredSearch.mockReturnValue(defaultFilteredSearch({ isError: true, enabled: true }));
    renderPage("igbo", "members");
    expect(screen.getByText("errorTitle")).toBeDefined();
  });

  it("shows no-results in filtered mode when allItems is empty", () => {
    mockUseFilteredSearch.mockReturnValue(defaultFilteredSearch({ enabled: true, allItems: [] }));
    renderPage("zzz", "members");
    expect(screen.getByText((text) => text.startsWith("noResults:"))).toBeDefined();
  });

  it("registers IntersectionObserver when hasNextPage is true", () => {
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({
        enabled: true,
        allItems: [FILTERED_MEMBER_ITEM],
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    );
    renderPage("bob", "members");
    // IntersectionObserver should have been called to set up the sentinel
    expect(global.IntersectionObserver).toHaveBeenCalled();
  });

  it("shows end-of-results when no next page and has results", () => {
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({
        enabled: true,
        allItems: [FILTERED_MEMBER_ITEM],
        hasNextPage: false,
      }),
    );
    renderPage("bob", "members");
    expect(screen.getByText("endOfResults")).toBeDefined();
  });

  it("shows loadingMore text when isFetchingNextPage", () => {
    // Provide hasNextPage: false so no sentinel is rendered, but isFetchingNextPage: true
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({
        enabled: true,
        allItems: [FILTERED_MEMBER_ITEM],
        hasNextPage: false,
        isFetchingNextPage: true,
      }),
    );
    renderPage("bob", "members");
    expect(screen.getByText("loadingMore")).toBeDefined();
  });

  it("renders highlight HTML for items with highlight field", () => {
    const itemWithHighlight = {
      ...FILTERED_MEMBER_ITEM,
      highlight: "<mark>Bob</mark> community",
    };
    mockUseFilteredSearch.mockReturnValue(
      defaultFilteredSearch({ enabled: true, allItems: [itemWithHighlight] }),
    );
    renderPage("bob", "members");
    expect(document.querySelector("mark")).toBeDefined();
  });

  it("renders dismissible chip with × button", () => {
    render(
      React.createElement(SearchResultsContent, {
        initialQuery: "igbo",
        initialType: "members",
        initialFilters: { location: "Lagos" },
      }),
    );
    expect(screen.getByText("Lagos")).toBeDefined();
    // There should be a close button for the chip
    expect(screen.getByLabelText("filters.clear")).toBeDefined();
  });

  it("clears all filters when clear-all is clicked", () => {
    render(
      React.createElement(SearchResultsContent, {
        initialQuery: "igbo",
        initialType: "members",
        initialFilters: { location: "Lagos" },
      }),
    );
    const clearAllBtn = screen.getByText("filters.clearAll");
    fireEvent.click(clearAllBtn);
    expect(mockPush).toHaveBeenCalled();
  });

  it("shows category filter only for posts type", () => {
    renderPage("igbo", "posts");
    expect(screen.getByText("filters.category")).toBeDefined();
  });

  it("does not show category filter for members type", () => {
    renderPage("igbo", "members");
    expect(screen.queryByText("filters.category")).toBeNull();
  });

  it("shows location filter for members type", () => {
    renderPage("igbo", "members");
    expect(screen.getByText("filters.location")).toBeDefined();
  });

  it("shows location filter for events type", () => {
    renderPage("igbo", "events");
    expect(screen.getByText("filters.location")).toBeDefined();
  });

  it("does not show location filter for posts type", () => {
    renderPage("igbo", "posts");
    expect(screen.queryByText("filters.location")).toBeNull();
  });

  it("shows membershipTier filter only for members type", () => {
    renderPage("igbo", "members");
    expect(screen.getByText("filters.membershipTier")).toBeDefined();
  });

  it("clears type-specific filters when switching type via select", () => {
    render(
      React.createElement(SearchResultsContent, {
        initialQuery: "igbo",
        initialType: "members",
        initialFilters: { membershipTier: "BASIC", location: "Lagos", dateRange: "today" },
      }),
    );
    // Switch type from members to posts
    const typeSelect = screen.getByLabelText("typeSelector");
    fireEvent.change(typeSelect, { target: { value: "posts" } });
    // router.push should have been called with URL that keeps dateRange but NOT membershipTier/location
    expect(mockPush).toHaveBeenCalled();
    const url = mockPush.mock.calls[0]?.[0] as string;
    expect(url).toContain("type=posts");
    expect(url).toContain("dateRange=today");
    expect(url).not.toContain("membershipTier");
    expect(url).not.toContain("location");
  });

  it("syncUrl produces a proper URL string (not [object Object])", () => {
    render(
      React.createElement(SearchResultsContent, {
        initialQuery: "igbo",
        initialType: "members",
        initialFilters: { location: "Lagos" },
      }),
    );
    const clearAllBtn = screen.getByText("filters.clearAll");
    fireEvent.click(clearAllBtn);
    const url = mockPush.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/^\/search/);
    expect(url).not.toContain("[object");
  });
});
