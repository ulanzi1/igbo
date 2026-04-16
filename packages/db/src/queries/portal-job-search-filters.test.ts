// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();

vi.mock("../index", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

import {
  buildFilterPredicate,
  searchJobPostingsWithFilters,
  getJobSearchFacets,
  getJobSearchTotalCount,
} from "./portal-job-search";
import type { JobSearchFilters } from "./portal-job-search";

// ---------------------------------------------------------------------------
// flattenSql helper (same as portal-job-search.test.ts — inline for isolation)
// ---------------------------------------------------------------------------
function flattenSql(sqlObj: unknown): string {
  if (sqlObj == null) return "";
  if (typeof sqlObj === "string" || typeof sqlObj === "number") return String(sqlObj);
  if (Array.isArray(sqlObj)) return sqlObj.map(flattenSql).join(" ");
  const obj = sqlObj as Record<string, unknown>;
  if (Array.isArray(obj.queryChunks)) {
    return (obj.queryChunks as unknown[]).map(flattenSql).join(" ");
  }
  if (obj.value !== undefined) {
    return Array.isArray(obj.value)
      ? (obj.value as unknown[]).map(flattenSql).join(" ")
      : flattenSql(obj.value);
  }
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildFilterPredicate — SQL structure assertions
// ---------------------------------------------------------------------------

describe("buildFilterPredicate — status gate always applied", () => {
  it("always includes status='active' AND archived_at IS NULL", () => {
    const predicate = buildFilterPredicate(undefined, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("status = 'active'");
    expect(rendered).toContain("archived_at IS NULL");
    expect(rendered).toContain("application_deadline");
  });

  it("empty filters produce just the status gate", () => {
    const predicate = buildFilterPredicate({}, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("status = 'active'");
    // No location or employment_type predicates
    expect(rendered).not.toContain("ANY");
  });
});

describe("buildFilterPredicate — location filter", () => {
  it("emits location = ANY(...) when location array provided", () => {
    const predicate = buildFilterPredicate({ location: ["Lagos, Nigeria", "Remote"] }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("location = ANY(");
    expect(rendered).toContain("Lagos, Nigeria");
    expect(rendered).toContain("Remote");
  });

  it("omits location filter when empty array", () => {
    const predicate = buildFilterPredicate({ location: [] }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("location = ANY(");
  });

  it("omits location filter when facetExclusion=location", () => {
    const predicate = buildFilterPredicate({ location: ["Lagos"] }, "en", "location");
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("location = ANY(");
  });
});

describe("buildFilterPredicate — employment type filter", () => {
  it("emits employment_type = ANY(...)::portal_employment_type[]", () => {
    const predicate = buildFilterPredicate({ employmentType: ["full_time", "contract"] }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("employment_type = ANY(");
    expect(rendered).toContain("portal_employment_type[]");
    expect(rendered).toContain("full_time");
    expect(rendered).toContain("contract");
  });

  it("omits employment type filter when excludeFacet=employmentType", () => {
    const predicate = buildFilterPredicate(
      { employmentType: ["full_time"] },
      "en",
      "employmentType",
    );
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("employment_type = ANY(");
  });
});

describe("buildFilterPredicate — industry filter", () => {
  it("emits company_id IN (SELECT id FROM portal_company_profiles WHERE industry = ANY(...))", () => {
    const predicate = buildFilterPredicate({ industry: ["Technology", "Finance"] }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("company_id IN");
    expect(rendered).toContain("portal_company_profiles");
    expect(rendered).toContain("industry = ANY(");
    expect(rendered).toContain("Technology");
    expect(rendered).toContain("Finance");
  });

  it("omits industry filter when excludeFacet=industry", () => {
    const predicate = buildFilterPredicate({ industry: ["Technology"] }, "en", "industry");
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("portal_company_profiles");
  });
});

describe("buildFilterPredicate — salary range filter", () => {
  it("emits salary_max >= salaryMin predicate when salaryMin provided", () => {
    const predicate = buildFilterPredicate({ salaryMin: 50000 }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("salary_max IS NULL OR salary_max >=");
    expect(rendered).toContain("50000");
  });

  it("emits salary_min <= salaryMax predicate when salaryMax provided", () => {
    const predicate = buildFilterPredicate({ salaryMax: 100000 }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("salary_min IS NULL OR salary_min <=");
    expect(rendered).toContain("100000");
  });

  it("emits both salary predicates when both salaryMin and salaryMax provided", () => {
    const predicate = buildFilterPredicate({ salaryMin: 50000, salaryMax: 150000 }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("salary_max IS NULL OR salary_max >=");
    expect(rendered).toContain("salary_min IS NULL OR salary_min <=");
  });

  it("omits salary predicates when excludeFacet=salaryRange", () => {
    const predicate = buildFilterPredicate(
      { salaryMin: 50000, salaryMax: 100000 },
      "en",
      "salaryRange",
    );
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("salary_max >=");
    expect(rendered).not.toContain("salary_min <=");
  });
});

describe("buildFilterPredicate — remote filter", () => {
  it("emits location ~* 'remote' OR diasporaFriendly predicate when remote=true", () => {
    const predicate = buildFilterPredicate({ remote: true }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("location ~*");
    expect(rendered).toContain("remote");
    expect(rendered).toContain("diasporaFriendly");
  });

  it("omits remote predicate when remote=false", () => {
    const predicate = buildFilterPredicate({ remote: false }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).not.toContain("location ~*");
  });
});

describe("buildFilterPredicate — culturalContext filters", () => {
  it("emits diasporaFriendly predicate", () => {
    const predicate = buildFilterPredicate({ culturalContext: { diasporaFriendly: true } }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("diasporaFriendly");
    expect(rendered).toContain("::boolean = true");
  });

  it("maps igboPreferred → igboLanguagePreferred in SQL", () => {
    const predicate = buildFilterPredicate({ culturalContext: { igboPreferred: true } }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("igboLanguagePreferred");
    expect(rendered).not.toContain("igboPreferred");
  });

  it("emits communityReferred predicate", () => {
    const predicate = buildFilterPredicate({ culturalContext: { communityReferred: true } }, "en");
    const rendered = flattenSql(predicate);
    expect(rendered).toContain("communityReferred");
    expect(rendered).toContain("::boolean = true");
  });
});

// ---------------------------------------------------------------------------
// searchJobPostingsWithFilters — SQL structure via mockDbExecute
// ---------------------------------------------------------------------------

const sampleFilteredRow = {
  id: "post-1",
  title: "Software Engineer",
  company_name: "TechCorp",
  company_id: "company-uuid-1",
  logo_url: null,
  location: "Lagos, Nigeria",
  salary_min: 50000,
  salary_max: 100000,
  salary_competitive_only: false,
  employment_type: "full_time",
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-01T00:00:00.000Z",
  relevance: 0.85,
  snippet: "<mark>Software</mark> Engineer",
};

describe("searchJobPostingsWithFilters — basic call", () => {
  it("calls db.execute and returns filtered results", async () => {
    mockDbExecute.mockResolvedValue([sampleFilteredRow]);

    const { items } = await searchJobPostingsWithFilters({ query: "engineer", locale: "en" });
    expect(items).toHaveLength(1);
    expect(items[0]?.company_name).toBe("TechCorp");
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("includes LEFT JOIN portal_company_profiles in SQL", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostingsWithFilters({ query: "developer", locale: "en" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("portal_company_profiles");
    expect(rendered).toContain("LEFT JOIN");
    expect(rendered).toContain("company_name");
    expect(rendered).toContain("logo_url");
  });

  it("includes company_id in SELECT projection (P-4.1B additive field)", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostingsWithFilters({ query: "engineer", locale: "en" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("company_id");
  });

  it("returns company_id from row data", async () => {
    mockDbExecute.mockResolvedValue([sampleFilteredRow]);

    const { items } = await searchJobPostingsWithFilters({ query: "engineer", locale: "en" });
    expect(items[0]?.company_id).toBe("company-uuid-1");
  });

  it("does NOT include requirements in SELECT (large column excluded per AC #5)", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostingsWithFilters({ query: "manager", locale: "en" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // requirements is never referenced in this query
    expect(rendered).not.toContain("requirements");
    // description_html is used only inside the ts_headline source expression (not a named output column)
    // The SELECT list uses it only within regexp_replace(COALESCE(pjp.description_html, ...))
    // to compute the snippet — this is correct (AC #5 forbids it as a raw SELECT alias)
    expect(rendered).toContain("company_name");
    expect(rendered).toContain("logo_url");
    expect(rendered).toContain("salary_competitive_only");
    expect(rendered).toContain("cultural_context_json");
  });

  it("uses search_vector_igbo for Igbo locale", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostingsWithFilters({ query: "onye mmemme", locale: "ig" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("search_vector_igbo");
    expect(rendered).toContain("plainto_tsquery('simple',");
  });

  it("omits FTS predicate and returns relevance=null for empty query", async () => {
    mockDbExecute.mockResolvedValue([{ ...sampleFilteredRow, relevance: null, snippet: null }]);

    const { items } = await searchJobPostingsWithFilters({ locale: "en" });
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).not.toContain("search_vector @@");
    expect(rendered).toContain("NULL::float4");
    expect(items[0]?.relevance).toBeNull();
  });

  it("passes nextCursor when db returns safeLimit+1 rows", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      ...sampleFilteredRow,
      id: `post-${i}`,
    }));
    mockDbExecute.mockResolvedValue(rows);

    const { items, nextCursor } = await searchJobPostingsWithFilters({
      query: "engineer",
      locale: "en",
      limit: 5,
    });
    expect(items).toHaveLength(5);
    expect(nextCursor).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getJobSearchFacets — mock DB responses
// ---------------------------------------------------------------------------

describe("getJobSearchFacets", () => {
  it("calls db.execute 4 times (4 facet queries in Promise.all)", async () => {
    mockDbExecute
      .mockResolvedValueOnce([{ value: "Lagos, Nigeria", count: 3 }]) // location
      .mockResolvedValueOnce([{ value: "full_time", count: 5 }]) // employmentType
      .mockResolvedValueOnce([{ value: "Technology", count: 2 }]) // industry
      .mockResolvedValueOnce([{ bucket: "50k-100k", count: 4 }]); // salaryRange

    const filters: JobSearchFilters = {};
    const facets = await getJobSearchFacets(filters, "en", "engineer");

    expect(mockDbExecute).toHaveBeenCalledTimes(4);
    expect(facets.location).toEqual([{ value: "Lagos, Nigeria", count: 3 }]);
    expect(facets.employmentType).toEqual([{ value: "full_time", count: 5 }]);
    expect(facets.industry).toEqual([{ value: "Technology", count: 2 }]);
    expect(facets.salaryRange).toEqual([{ bucket: "50k-100k", count: 4 }]);
  });

  it("excludes location self-facet in the location query", async () => {
    mockDbExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getJobSearchFacets({ location: ["Lagos"] }, "en");

    // First call is location facet — should NOT contain location = ANY(...)
    const locationQueryRendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(locationQueryRendered).not.toContain("location = ANY(");

    // Second call is employmentType facet — SHOULD still have status gate
    const etQueryRendered = flattenSql(mockDbExecute.mock.calls[1]![0]);
    expect(etQueryRendered).toContain("status = 'active'");
  });

  it("excludes industry self-facet from industry query but includes JOIN", async () => {
    mockDbExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getJobSearchFacets({ industry: ["Technology"] }, "en");

    // Third call is industry facet
    const industryQueryRendered = flattenSql(mockDbExecute.mock.calls[2]![0]);
    // The industry filter itself should be excluded
    expect(industryQueryRendered).not.toContain("company_id IN");
    // But the JOIN is still present
    expect(industryQueryRendered).toContain("portal_company_profiles");
  });

  it("returns empty arrays when db returns empty results", async () => {
    mockDbExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const facets = await getJobSearchFacets(undefined, "en");
    expect(facets.location).toEqual([]);
    expect(facets.employmentType).toEqual([]);
    expect(facets.industry).toEqual([]);
    expect(facets.salaryRange).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getJobSearchTotalCount
// ---------------------------------------------------------------------------

describe("getJobSearchTotalCount", () => {
  it("returns count from db for English query", async () => {
    mockDbExecute.mockResolvedValue([{ count: 42 }]);

    const count = await getJobSearchTotalCount({}, "en", "engineer");
    expect(count).toBe(42);
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("COUNT(*)");
    expect(rendered).toContain("search_vector @@");
  });

  it("returns count for Igbo query using search_vector_igbo", async () => {
    mockDbExecute.mockResolvedValue([{ count: 7 }]);

    const count = await getJobSearchTotalCount({}, "ig", "onye mmemme");
    expect(count).toBe(7);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("search_vector_igbo @@");
  });

  it("omits FTS predicate for empty query", async () => {
    mockDbExecute.mockResolvedValue([{ count: 25 }]);

    const count = await getJobSearchTotalCount(undefined, "en");
    expect(count).toBe(25);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).not.toContain("search_vector @@");
    expect(rendered).toContain("COUNT(*)");
  });

  it("returns 0 when db returns empty array (no rows)", async () => {
    mockDbExecute.mockResolvedValue([]);

    const count = await getJobSearchTotalCount({}, "en");
    expect(count).toBe(0);
  });
});
