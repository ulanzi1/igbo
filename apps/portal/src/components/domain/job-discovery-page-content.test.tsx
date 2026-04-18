// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import igMessages from "../../../messages/ig.json";
import type { DiscoveryJobResult, IndustryCategoryCount } from "@igbo/db/queries/portal-job-search";

expect.extend(toHaveNoViolations);

const mockRouterPush = vi.fn();

// Mutable session state — tests can set activePortalRole per-test
const sessionState: { data: { user?: { activePortalRole?: string } } | null } = { data: null };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => "/en/jobs",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: sessionState.data,
    status: sessionState.data ? "authenticated" : "unauthenticated",
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.data = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

import { JobDiscoveryPageContent } from "./job-discovery-page-content";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const makeJob = (id: string, title: string): DiscoveryJobResult => ({
  id,
  title,
  company_name: "TechCorp",
  company_id: "company-uuid-1",
  logo_url: null,
  location: "Lagos, Nigeria",
  salary_min: null,
  salary_max: null,
  salary_competitive_only: false,
  employment_type: "full_time",
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-01T00:00:00.000Z",
});

const makeCategory = (industry: string, count: number): IndustryCategoryCount => ({
  industry,
  count,
});

const sampleFeaturedJobs = [makeJob("f-1", "Featured Engineer"), makeJob("f-2", "Featured PM")];
const sampleCategories = [makeCategory("technology", 42), makeCategory("finance", 18)];
const sampleRecentJobs = [makeJob("r-1", "Recent Developer"), makeJob("r-2", "Recent Analyst")];

function renderDiscovery(
  props: {
    featuredJobs?: DiscoveryJobResult[];
    categories?: IndustryCategoryCount[];
    recentPostings?: DiscoveryJobResult[];
  } = {},
  locale = "en",
) {
  const {
    featuredJobs = sampleFeaturedJobs,
    categories = sampleCategories,
    recentPostings = sampleRecentJobs,
  } = props;
  const messages = locale === "ig" ? igMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <JobDiscoveryPageContent
        featuredJobs={featuredJobs}
        categories={categories}
        recentPostings={recentPostings}
      />
    </NextIntlClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — basic rendering", () => {
  it("renders h1 page heading", () => {
    renderDiscovery();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders h2 for Featured Jobs section", () => {
    renderDiscovery();
    expect(screen.getByRole("heading", { level: 2, name: /Featured Jobs/i })).toBeInTheDocument();
  });

  it("renders h2 for Browse by Category section", () => {
    renderDiscovery();
    expect(
      screen.getByRole("heading", { level: 2, name: /Browse by Category/i }),
    ).toBeInTheDocument();
  });

  it("renders h2 for Recent Postings section", () => {
    renderDiscovery();
    expect(screen.getByRole("heading", { level: 2, name: /Recent Postings/i })).toBeInTheDocument();
  });

  it("renders featured job cards", () => {
    renderDiscovery();
    expect(screen.getByText("Featured Engineer")).toBeInTheDocument();
    expect(screen.getByText("Featured PM")).toBeInTheDocument();
  });

  it("renders recent job cards", () => {
    renderDiscovery();
    expect(screen.getByText("Recent Developer")).toBeInTheDocument();
    expect(screen.getByText("Recent Analyst")).toBeInTheDocument();
  });

  it("renders category cards", () => {
    renderDiscovery();
    expect(screen.getByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Finance & Banking")).toBeInTheDocument();
  });

  it("renders search bar with correct role and aria-label", () => {
    renderDiscovery();
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Search bar navigation
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — search bar", () => {
  it("navigates to /search?q=value on form submit with a query", () => {
    renderDiscovery();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "developer" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(mockRouterPush).toHaveBeenCalledWith("/en/search?q=developer");
  });

  it("navigates to /search with no query when input is empty", () => {
    renderDiscovery();
    fireEvent.submit(screen.getByRole("search"));
    expect(mockRouterPush).toHaveBeenCalledWith("/en/search");
  });

  it("trims whitespace before navigating", () => {
    renderDiscovery();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  developer  " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(mockRouterPush).toHaveBeenCalledWith("/en/search?q=developer");
  });

  it("shows clear button when search input has value", () => {
    renderDiscovery();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    expect(screen.getByLabelText(/Clear search/i)).toBeInTheDocument();
  });

  it("hides clear button when search input is empty", () => {
    renderDiscovery();
    expect(screen.queryByLabelText(/Clear search/i)).not.toBeInTheDocument();
  });

  it("clears input when clear button is clicked", () => {
    renderDiscovery();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    const clearBtn = screen.getByLabelText(/Clear search/i);
    fireEvent.click(clearBtn);
    expect(input.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Partial data state — independent section visibility (AC #8)
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — partial data states", () => {
  it("hides Featured section when featuredJobs is empty", () => {
    renderDiscovery({
      featuredJobs: [],
      categories: sampleCategories,
      recentPostings: sampleRecentJobs,
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: /Featured Jobs/i }),
    ).not.toBeInTheDocument();
    // Other sections still visible
    expect(
      screen.getByRole("heading", { level: 2, name: /Browse by Category/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Recent Postings/i })).toBeInTheDocument();
  });

  it("hides Browse by Category section when categories is empty", () => {
    renderDiscovery({
      featuredJobs: sampleFeaturedJobs,
      categories: [],
      recentPostings: sampleRecentJobs,
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: /Browse by Category/i }),
    ).not.toBeInTheDocument();
    // Other sections still visible
    expect(screen.getByRole("heading", { level: 2, name: /Featured Jobs/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Recent Postings/i })).toBeInTheDocument();
  });

  it("hides Recent Postings section when recentPostings is empty", () => {
    renderDiscovery({
      featuredJobs: sampleFeaturedJobs,
      categories: sampleCategories,
      recentPostings: [],
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: /Recent Postings/i }),
    ).not.toBeInTheDocument();
    // Other sections still visible
    expect(screen.getByRole("heading", { level: 2, name: /Featured Jobs/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Browse by Category/i }),
    ).toBeInTheDocument();
  });

  it("shows cold-start empty state when all three arrays are empty", () => {
    renderDiscovery({ featuredJobs: [], categories: [], recentPostings: [] });
    // All three section headings hidden
    expect(
      screen.queryByRole("heading", { level: 2, name: /Featured Jobs/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /Browse by Category/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /Recent Postings/i }),
    ).not.toBeInTheDocument();
    // Cold start message visible
    expect(screen.getByText(/New opportunities are being added daily/i)).toBeInTheDocument();
  });

  it("shows cold-start empty state with a browse-all link", () => {
    renderDiscovery({ featuredJobs: [], categories: [], recentPostings: [] });
    // MEDIUM-5 review fix: cold-start CTA uses semantically distinct
    // discovery.browseAllJobs ("Browse all jobs") instead of featuredViewAll.
    expect(screen.getByRole("link", { name: /Browse all jobs/i })).toBeInTheDocument();
  });

  it("renders partial featured jobs (less than max 6) without placeholders", () => {
    renderDiscovery({
      featuredJobs: [makeJob("f-1", "Only Job")],
      categories: [],
      recentPostings: [],
    });
    const cards = screen.getAllByTestId("job-result-card");
    expect(cards).toHaveLength(1);
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// "View all" links
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — view all links", () => {
  it("featured section has a View all link pointing to /search", () => {
    renderDiscovery();
    const featuredSection = screen.getByRole("region", { name: /featured jobs/i });
    const link = featuredSection.querySelector("a[href*='/search']");
    expect(link).toBeTruthy();
  });

  it("recent section has a View all link pointing to /search", () => {
    renderDiscovery();
    const recentSection = screen.getByRole("region", { name: /recent postings/i });
    const link = recentSection.querySelector("a[href*='/search']");
    expect(link).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Heading hierarchy — no heading-level skips (axe heading-order)
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — heading hierarchy", () => {
  it("uses h1 → h2 hierarchy (no skips)", () => {
    renderDiscovery();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h1s).toHaveLength(1);
    expect(h2s.length).toBeGreaterThanOrEqual(3);
    // No h3 headings on this page
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — accessibility", () => {
  it("passes axe-core with all sections populated", async () => {
    const { container } = renderDiscovery();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core with empty state (cold start)", async () => {
    const { container } = renderDiscovery({ featuredJobs: [], categories: [], recentPostings: [] });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core with partial data (featured missing)", async () => {
    const { container } = renderDiscovery({
      featuredJobs: [],
      categories: sampleCategories,
      recentPostings: sampleRecentJobs,
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// HIGH-3 review fix: Igbo locale coverage
// ---------------------------------------------------------------------------

describe("JobDiscoveryPageContent — Igbo locale", () => {
  it("renders the Igbo page heading", () => {
    renderDiscovery({}, "ig");
    // ig.json: discovery.heading = "Chọpụta Ohere"
    expect(screen.getByRole("heading", { level: 1, name: /Chọpụta Ohere/i })).toBeInTheDocument();
  });

  it("renders Igbo featured-section heading", () => {
    renderDiscovery({}, "ig");
    // ig.json: discovery.featuredHeading = "Ọrụ Ndị Pụtara Ìhè"
    expect(
      screen.getByRole("heading", { level: 2, name: /Ọrụ Ndị Pụtara Ìhè/i }),
    ).toBeInTheDocument();
  });

  it("renders Igbo browse-by-category heading", () => {
    renderDiscovery({}, "ig");
    // ig.json: discovery.categoriesHeading = "Lelee site na Ụdị"
    expect(
      screen.getByRole("heading", { level: 2, name: /Lelee site na Ụdị/i }),
    ).toBeInTheDocument();
  });

  it("renders Igbo cold-start CTA when all sections empty", () => {
    renderDiscovery({ featuredJobs: [], categories: [], recentPostings: [] }, "ig");
    // ig.json: discovery.browseAllJobs = "Chọgharịa ọrụ niile"
    expect(screen.getByRole("link", { name: /Chọgharịa ọrụ niile/i })).toBeInTheDocument();
  });

  it("uses /ig/search routes for navigation in Igbo locale", () => {
    renderDiscovery({}, "ig");
    const links = Array.from(document.querySelectorAll('a[href*="/search"]'));
    // All View All links should be /ig/search (not /en/search)
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      // Allow /ig/search and /ig/search?... but not /en/search
      expect(href.startsWith("/ig/search")).toBe(true);
    }
  });

  it("passes axe-core in Igbo locale", async () => {
    const { container } = renderDiscovery({}, "ig");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Match scores (P-4.5)
// ---------------------------------------------------------------------------

import type { MatchScoreResult } from "@igbo/config";
import { waitFor } from "@testing-library/react";

const strongDiscoveryScore: MatchScoreResult = {
  score: 80,
  tier: "strong",
  signals: { skillsOverlap: 55, locationMatch: true, employmentTypeMatch: true },
};

describe("JobDiscoveryPageContent — match scores (P-4.5)", () => {
  it("renders MatchPill on featured card when seeker has scores", async () => {
    sessionState.data = { user: { activePortalRole: "JOB_SEEKER" } };
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { scores: { "f-1": strongDiscoveryScore } } }),
    } as Response);

    renderDiscovery();
    await waitFor(() => expect(screen.getByTestId("match-pill")).toBeInTheDocument());
  });

  it("does NOT render MatchPill when user is not authenticated (guest)", () => {
    // sessionState.data is null — no fetch needed
    renderDiscovery();
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });

  it("does NOT render MatchPill for EMPLOYER role", () => {
    sessionState.data = { user: { activePortalRole: "EMPLOYER" } };
    renderDiscovery();
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });
});
