// @vitest-environment jsdom
/**
 * Integration test for the public search page.
 *
 * This is the AC #1 evidence test: asserts that given a set of URL search params,
 * the page renders, fires exactly one fetch to /api/v1/jobs/search with the expected
 * query string, and displays the expected results + active-filter chips. Includes the
 * AC #10 axe.run() integration-level accessibility assertion (story spec line 165).
 *
 * Added as part of the P-4.1B code review (review fix H1).
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../../messages/en.json";

expect.extend(toHaveNoViolations);

// ─── Mocks ────────────────────────────────────────────────────────────────────

// useSearchParams returns a real URLSearchParams instance (required by parseSearchUrlParams's
// `instanceof URLSearchParams` check — see MEMORY.md note on P-4.1B mock requirements).
const searchParamsRef = { current: new URLSearchParams() };

const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => "/en/search",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("server-only", () => ({}));

// next-intl/server is used by generateMetadata (not exercised by the render path,
// but SearchPage's imports resolve through this module). Stub so import evaluation works.
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockImplementation(() => Promise.resolve((key: string) => key)),
}));

// Stub the portal layout chrome so the integration test stays focused on the search page
// content and we don't have to mock out full nav / session / role machinery. The page's
// own layout.tsx wraps with PortalLayout, but here we render just the page output.
vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Polyfills required by Radix UI (Select / Sheet / Switch) in jsdom
beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ─── Test Utilities ───────────────────────────────────────────────────────────

import SearchPage, { generateMetadata } from "./page";

interface CapturedFetch {
  url: string;
  signal: AbortSignal | undefined;
}

let capturedFetchCalls: CapturedFetch[] = [];

function makeApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    results: [
      {
        id: "job-1",
        title: "Senior Software Engineer",
        companyName: "Acme Nigeria",
        companyId: "c-1",
        companyLogoUrl: null,
        location: "Lagos, Nigeria",
        employmentType: "full_time",
        salaryMin: 500000,
        salaryMax: 800000,
        salaryCompetitiveOnly: false,
        culturalContext: null,
        applicationDeadline: null,
        createdAt: new Date().toISOString(),
        relevance: 0.9,
        snippet: null,
      },
    ],
    facets: {
      location: [{ value: "Lagos, Nigeria", count: 1 }],
      employmentType: [{ value: "full_time", count: 1 }],
      industry: [],
      salaryRange: [],
    },
    pagination: {
      nextCursor: null,
      totalCount: 1,
      effectiveSort: "relevance" as const,
    },
    ...overrides,
  };
}

function mockFetchSuccess(response = makeApiResponse()) {
  vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    capturedFetchCalls.push({ url: String(url), signal: init?.signal ?? undefined });
    return { ok: true, json: async () => response } as Response;
  });
}

function setSearchParams(params: Record<string, string | string[]>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const val of v) usp.append(k, val);
    } else {
      usp.set(k, v);
    }
  }
  searchParamsRef.current = usp;
}

async function renderSearchPage(
  searchParams: Record<string, string | string[]> = {},
  locale = "en",
) {
  // Sync the URLSearchParams ref BEFORE render — useSearchParams() reads this at render.
  setSearchParams(searchParams);

  // Invoke the server component (async function) and render the returned JSX.
  const node = await SearchPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  });

  return render(
    <NextIntlClientProvider locale={locale} messages={enMessages}>
      {node as React.ReactElement}
    </NextIntlClientProvider>,
  );
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedFetchCalls = [];
  searchParamsRef.current = new URLSearchParams();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SearchPage — cold start (no URL params)", () => {
  it("renders the page heading", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    expect(screen.getByRole("heading", { level: 1, name: /Search Jobs/i })).toBeInTheDocument();
  });

  it("renders the search bar with empty value", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    const input = screen.getByLabelText(/Search jobs/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("fires exactly one fetch on initial load", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    await waitFor(() => expect(capturedFetchCalls.length).toBeGreaterThanOrEqual(1));
    expect(capturedFetchCalls).toHaveLength(1);
  });

  it("fetches /api/v1/jobs/search with default sort=relevance", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    await waitFor(() => expect(capturedFetchCalls.length).toBeGreaterThanOrEqual(1));
    expect(capturedFetchCalls[0]?.url).toMatch(/^\/api\/v1\/jobs\/search\?/);
    expect(capturedFetchCalls[0]?.url).toContain("sort=relevance");
  });

  it("renders the result card after successful fetch", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    await waitFor(() => expect(screen.getAllByTestId("job-result-card").length).toBeGreaterThan(0));
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Acme Nigeria")).toBeInTheDocument();
  });

  it("does NOT render active-filters-bar when no filters are active", async () => {
    mockFetchSuccess();
    await renderSearchPage({});
    await waitFor(() => expect(screen.getAllByTestId("job-result-card").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("active-filters-bar")).not.toBeInTheDocument();
  });
});

describe("SearchPage — URL-hydrated filter state", () => {
  it("hydrates q from URL and passes it to fetch as 'query' param", async () => {
    mockFetchSuccess();
    await renderSearchPage({ q: "engineer" });
    await waitFor(() => expect(capturedFetchCalls.length).toBeGreaterThanOrEqual(1));
    expect(capturedFetchCalls[0]?.url).toContain("query=engineer");
  });

  it("hydrates location filter from URL and renders a removable chip", async () => {
    mockFetchSuccess();
    await renderSearchPage({ location: "Lagos" });
    await waitFor(() => expect(screen.getByTestId("active-filters-bar")).toBeInTheDocument());
    expect(screen.getByTestId("filter-chip-location-Lagos")).toBeInTheDocument();
    // The fetch URL must include the hydrated filter
    expect(capturedFetchCalls[0]?.url).toContain("location=Lagos");
  });

  it("hydrates multi-value location from URL (rendered chips match URL values)", async () => {
    mockFetchSuccess();
    await renderSearchPage({ location: ["Lagos", "Toronto"] });
    await waitFor(() => expect(screen.getByTestId("active-filters-bar")).toBeInTheDocument());
    expect(screen.getByTestId("filter-chip-location-Lagos")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-location-Toronto")).toBeInTheDocument();
  });

  it("hydrates remote=true and renders remote chip", async () => {
    mockFetchSuccess();
    await renderSearchPage({ remote: "true" });
    await waitFor(() => expect(screen.getByTestId("active-filters-bar")).toBeInTheDocument());
    expect(screen.getByTestId("filter-chip-remote")).toBeInTheDocument();
    expect(capturedFetchCalls[0]?.url).toContain("remote=true");
  });

  it("silently drops invalid sort values (graceful URL degradation)", async () => {
    mockFetchSuccess();
    await renderSearchPage({ sort: "hacker" });
    await waitFor(() => expect(capturedFetchCalls.length).toBeGreaterThanOrEqual(1));
    // Invalid sort → default to relevance
    expect(capturedFetchCalls[0]?.url).toContain("sort=relevance");
    expect(capturedFetchCalls[0]?.url).not.toContain("sort=hacker");
  });

  it("fetches with the exact query-string set the URL asked for (no noise)", async () => {
    mockFetchSuccess();
    await renderSearchPage({ q: "designer", remote: "true", location: "Enugu" });
    await waitFor(() => expect(capturedFetchCalls.length).toBeGreaterThanOrEqual(1));
    const fetchUrl = capturedFetchCalls[0]?.url ?? "";
    expect(fetchUrl).toContain("query=designer");
    expect(fetchUrl).toContain("remote=true");
    expect(fetchUrl).toContain("location=Enugu");
    // Default boolean flags must NOT be emitted (M1-compliant)
    expect(fetchUrl).not.toContain("culturalContextDiasporaFriendly=");
    expect(fetchUrl).not.toContain("culturalContextIgboPreferred=");
  });
});

describe("SearchPage — empty states", () => {
  it("renders cold-start empty state when no query, no filters, and 0 results", async () => {
    mockFetchSuccess(
      makeApiResponse({
        results: [],
        pagination: { nextCursor: null, totalCount: 0, effectiveSort: "relevance" },
      }),
    );
    await renderSearchPage({});
    await waitFor(() => expect(screen.getByTestId("empty-state-cold-start")).toBeInTheDocument());
    expect(screen.queryByTestId("empty-state-filtered")).not.toBeInTheDocument();
  });

  it("renders filtered empty state when query/filters present but 0 results", async () => {
    mockFetchSuccess(
      makeApiResponse({
        results: [],
        pagination: { nextCursor: null, totalCount: 0, effectiveSort: "relevance" },
      }),
    );
    await renderSearchPage({ q: "does-not-exist" });
    await waitFor(() => expect(screen.getByTestId("empty-state-filtered")).toBeInTheDocument());
    expect(screen.queryByTestId("empty-state-cold-start")).not.toBeInTheDocument();
  });
});

describe("SearchPage — metadata", () => {
  it("generateMetadata returns a title containing the query when present", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ q: "frontend" }),
    });
    expect(meta.title).toContain("frontend");
  });

  it("generateMetadata returns a default title when no query", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBeTruthy();
    expect(typeof meta.title).toBe("string");
  });
});

describe("SearchPage — accessibility (AC #10 axe evidence)", () => {
  it("passes axe-core assertion on cold-start render", async () => {
    mockFetchSuccess();
    const { container } = await renderSearchPage({});
    await waitFor(() => expect(screen.getAllByTestId("job-result-card").length).toBeGreaterThan(0));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core assertion with active filters + chips rendered", async () => {
    mockFetchSuccess();
    const { container } = await renderSearchPage({
      q: "engineer",
      location: ["Lagos"],
      remote: "true",
    });
    await waitFor(() => expect(screen.getByTestId("active-filters-bar")).toBeInTheDocument());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core assertion on empty filtered state", async () => {
    mockFetchSuccess(
      makeApiResponse({
        results: [],
        pagination: { nextCursor: null, totalCount: 0, effectiveSort: "relevance" },
      }),
    );
    const { container } = await renderSearchPage({ q: "no-hits" });
    await waitFor(() => expect(screen.getByTestId("empty-state-filtered")).toBeInTheDocument());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
