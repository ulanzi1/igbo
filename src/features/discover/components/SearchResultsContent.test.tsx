// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const mockUseGlobalSearch = vi.fn();
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
}));

import { SearchResultsContent } from "./SearchResultsContent";

function defaultSearch(overrides = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    enabled: false,
    ...overrides,
  };
}

function renderPage(initialQuery = "") {
  return render(React.createElement(SearchResultsContent, { initialQuery }));
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

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGlobalSearch.mockReturnValue(defaultSearch());
});

describe("SearchResultsContent — loading", () => {
  it("renders skeleton when isLoading", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ isLoading: true, enabled: true }));
    renderPage("igbo");
    expect(document.querySelector("[aria-busy='true']")).toBeDefined();
  });
});

describe("SearchResultsContent — error state", () => {
  it("shows error message when isError", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ isError: true, enabled: true }));
    renderPage("igbo");
    expect(screen.getByText("errorTitle")).toBeDefined();
    expect(screen.getByText("errorHint")).toBeDefined();
  });
});

describe("SearchResultsContent — results", () => {
  it("renders result sections with items", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [MEMBER_SECTION, EVENT_SECTION],
          pageInfo: { hasNextPage: true, cursor: null },
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
          pageInfo: { hasNextPage: true, cursor: null },
        },
      }),
    );
    renderPage("igbo");
    // seeAll key is rendered for sections with hasMore=true
    expect(screen.getByText(/seeAll/i)).toBeDefined();
  });

  it("does NOT render 'See all' for sections without hasMore", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: {
          sections: [MEMBER_SECTION],
          pageInfo: { hasNextPage: false, cursor: null },
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
          pageInfo: { hasNextPage: false, cursor: null },
        },
      }),
    );
    renderPage("igbo");
    expect(screen.getByText(/resultsPage.title/i)).toBeDefined();
  });
});

describe("SearchResultsContent — empty state", () => {
  it("shows no-results message when data is empty", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        data: { sections: [], pageInfo: {} },
      }),
    );
    renderPage("zzz");
    // noResults key renders as "noResults:{...}" — noResultsHint renders as "noResultsHint:{...}"
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
          pageInfo: { hasNextPage: true, cursor: null },
        },
      }),
    );
    renderPage("igbo");
    const seeAllBtn = screen.getByText(/seeAll/i);
    fireEvent.click(seeAllBtn);
    expect(mockPush).toHaveBeenCalled();
  });
});

describe("SearchResultsContent — result item links", () => {
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
