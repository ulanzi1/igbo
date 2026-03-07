// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockUseGlobalSearch = vi.fn();
const mockPush = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

vi.mock("@/features/discover/hooks/use-global-search", () => ({
  useGlobalSearch: (...args: unknown[]) => mockUseGlobalSearch(...args),
}));

import { GlobalSearchBar } from "./GlobalSearchBar";

const MEMBER_ITEM = {
  id: "u1",
  type: "members",
  title: "Alice Obi",
  subtitle: "Lagos",
  imageUrl: null,
  href: "/profiles/u1",
  rank: 0.9,
};

const GROUP_ITEM = {
  id: "g1",
  type: "groups",
  title: "Igbo Diaspora",
  subtitle: "A group for diaspora members",
  imageUrl: null,
  href: "/groups/g1",
  rank: 0.8,
};

function defaultSearch(overrides = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isDeferred: false,
    enabled: false,
    ...overrides,
  };
}

function renderBar() {
  return render(React.createElement(GlobalSearchBar));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGlobalSearch.mockReturnValue(defaultSearch());
});

describe("GlobalSearchBar — render", () => {
  it("renders a search input with correct aria-label", () => {
    renderBar();
    const input = screen.getByRole("combobox");
    expect(input).toBeDefined();
  });

  it("shows placeholder text", () => {
    renderBar();
    const input = screen.getByPlaceholderText("placeholder");
    expect(input).toBeDefined();
  });
});

describe("GlobalSearchBar — typing interaction", () => {
  it("shows minChars hint when fewer than 3 characters typed", () => {
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.focus(input);
    expect(screen.getByText("minChars")).toBeDefined();
  });

  it("shows loading state when isLoading and enabled", () => {
    mockUseGlobalSearch.mockReturnValue(defaultSearch({ isLoading: true, enabled: true }));
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "igbo" } });
    fireEvent.focus(input);
    expect(screen.getByText("loading")).toBeDefined();
  });

  it("shows no-results message when enabled and empty data", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        isLoading: false,
        data: { sections: [], pageInfo: {} },
      }),
    );
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.focus(input);
    expect(screen.getByText(/noResults/)).toBeDefined();
  });

  it("renders grouped result items when data is present", () => {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        isLoading: false,
        data: {
          sections: [
            { type: "members", items: [MEMBER_ITEM], hasMore: false },
            { type: "groups", items: [GROUP_ITEM], hasMore: false },
          ],
          pageInfo: { hasNextPage: false, cursor: null },
        },
      }),
    );
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "igbo" } });
    fireEvent.focus(input);

    expect(screen.getByText("Alice Obi")).toBeDefined();
    expect(screen.getByText("Igbo Diaspora")).toBeDefined();
  });

  it("shows clear button when input has value", () => {
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "igbo" } });
    expect(screen.getByLabelText("clearAriaLabel")).toBeDefined();
  });

  it("clears the input when clear button is clicked", () => {
    renderBar();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "igbo" } });
    const clearBtn = screen.getByLabelText("clearAriaLabel");
    fireEvent.click(clearBtn);
    expect(input.value).toBe("");
  });
});

describe("GlobalSearchBar — keyboard navigation", () => {
  function setupWithResults() {
    mockUseGlobalSearch.mockReturnValue(
      defaultSearch({
        enabled: true,
        isLoading: false,
        data: {
          sections: [{ type: "members", items: [MEMBER_ITEM, GROUP_ITEM], hasMore: false }],
          pageInfo: { hasNextPage: false, cursor: null },
        },
      }),
    );
    renderBar();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "igbo" } });
    fireEvent.focus(input);
    return input;
  }

  it("ArrowDown moves focus to first item", () => {
    const input = setupWithResults();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-item-0");
  });

  it("ArrowDown again moves to second item", () => {
    const input = setupWithResults();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-item-1");
  });

  it("ArrowUp from first item stays at -1 (no wrap)", () => {
    const input = setupWithResults();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("Escape closes the dropdown", () => {
    const input = setupWithResults();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter on active item triggers navigation", () => {
    const input = setupWithResults();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith(MEMBER_ITEM.href);
  });
});
