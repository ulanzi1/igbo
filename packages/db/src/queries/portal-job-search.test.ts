// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();

vi.mock("../index", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

import {
  searchJobPostings,
  encodeJobSearchCursor,
  decodeJobSearchCursor,
  findNewPostingsForAlert,
  getSimilarJobPostings,
  extractSimilarJobTokens,
} from "./portal-job-search";
import type { JobSearchResult, JobSearchCursor } from "./portal-job-search";

const sampleRow: JobSearchResult = {
  id: "post-1",
  title: "Software Engineer",
  location: "Lagos, Nigeria",
  salary_min: 50000,
  salary_max: 80000,
  employment_type: "full_time",
  created_at: "2026-04-01T00:00:00.000Z",
  relevance: "0.8573",
  snippet: "<mark>Software</mark> Engineer needed for a great role",
};

const igboRow: JobSearchResult = {
  id: "post-2",
  title: "Onye ọrụ teknọlọjị",
  location: "Enugu",
  salary_min: null,
  salary_max: null,
  employment_type: "contract",
  created_at: "2026-04-02T00:00:00.000Z",
  relevance: "0.6218",
  snippet: "<mark>Onye</mark> ọrụ teknọlọjị achọrọ",
};

/**
 * Walks a drizzle-orm sql object and flattens its query chunks and parameter values
 * into a single inspectable string so unit tests can assert on SQL tokens and params
 * without a real database connection.
 */
function flattenSql(sqlObj: unknown): string {
  if (sqlObj == null) return "";
  if (typeof sqlObj === "string" || typeof sqlObj === "number") {
    return String(sqlObj);
  }
  if (Array.isArray(sqlObj)) {
    return sqlObj.map(flattenSql).join(" ");
  }
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
// PREP-F tests — updated to new { items, nextCursor } return shape
// ---------------------------------------------------------------------------

describe("searchJobPostings — English locale", () => {
  it("returns ranked results for basic English search", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    const { items } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "post-1",
      title: "Software Engineer",
      relevance: "0.8573",
      snippet: "<mark>Software</mark> Engineer needed for a great role",
    });
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("maps all projected columns in result", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    const { items } = await searchJobPostings({ query: "developer", locale: "en" });

    expect(items[0]).toHaveProperty("id");
    expect(items[0]).toHaveProperty("title");
    expect(items[0]).toHaveProperty("location");
    expect(items[0]).toHaveProperty("salary_min");
    expect(items[0]).toHaveProperty("salary_max");
    expect(items[0]).toHaveProperty("employment_type");
    expect(items[0]).toHaveProperty("created_at");
    expect(items[0]).toHaveProperty("relevance");
    expect(items[0]).toHaveProperty("snippet");
  });

  it("respects limit parameter — calls execute once and returns db rows", async () => {
    const rows = [sampleRow, { ...sampleRow, id: "post-2", relevance: "0.72" }];
    mockDbExecute.mockResolvedValue(rows);

    const { items } = await searchJobPostings({ query: "engineer", locale: "en", limit: 5 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(items).toHaveLength(2);
  });

  it("returns multiple results ordered as db provides (rank DESC, created_at DESC)", async () => {
    const rows: JobSearchResult[] = [
      { ...sampleRow, id: "post-1", relevance: "0.85" },
      { ...sampleRow, id: "post-2", relevance: "0.72" },
      { ...sampleRow, id: "post-3", relevance: "0.45" },
    ];
    mockDbExecute.mockResolvedValue(rows);

    const { items } = await searchJobPostings({ query: "software", locale: "en" });

    expect(items).toHaveLength(3);
    expect(items[0]?.id).toBe("post-1");
    expect(items[1]?.id).toBe("post-2");
    expect(items[2]?.id).toBe("post-3");
  });

  it("handles null salary fields gracefully", async () => {
    mockDbExecute.mockResolvedValue([{ ...sampleRow, salary_min: null, salary_max: null }]);

    const { items } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items[0]?.salary_min).toBeNull();
    expect(items[0]?.salary_max).toBeNull();
  });

  it("handles null snippet gracefully", async () => {
    mockDbExecute.mockResolvedValue([{ ...sampleRow, snippet: null }]);

    const { items } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items[0]?.snippet).toBeNull();
  });

  it("returns empty array when db returns no results", async () => {
    mockDbExecute.mockResolvedValue([]);

    const { items } = await searchJobPostings({
      query: "nonexistent-keyword-xyz",
      locale: "en",
    });

    expect(items).toEqual([]);
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });
});

describe("searchJobPostings — Igbo locale", () => {
  it("calls execute once and returns results for Igbo locale", async () => {
    mockDbExecute.mockResolvedValue([igboRow]);

    const { items } = await searchJobPostings({ query: "onye ọrụ", locale: "ig" });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "post-2",
      title: "Onye ọrụ teknọlọjị",
    });
  });

  it("maps all columns for Igbo result", async () => {
    mockDbExecute.mockResolvedValue([igboRow]);

    const { items } = await searchJobPostings({ query: "teknọlọjị", locale: "ig" });

    expect(items[0]).toHaveProperty("id");
    expect(items[0]).toHaveProperty("title");
    expect(items[0]).toHaveProperty("relevance");
    expect(items[0]).toHaveProperty("snippet");
  });

  it("returns empty array when no Igbo results found", async () => {
    mockDbExecute.mockResolvedValue([]);

    const { items } = await searchJobPostings({ query: "nkechinyere", locale: "ig" });

    expect(items).toEqual([]);
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });
});

describe("searchJobPostings — empty query guard", () => {
  it("returns [] immediately for empty string without calling db", async () => {
    const { items } = await searchJobPostings({ query: "", locale: "en" });

    expect(items).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("returns [] immediately for whitespace-only query without calling db", async () => {
    const { items } = await searchJobPostings({ query: "   ", locale: "en" });

    expect(items).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("returns [] for empty Igbo query without calling db", async () => {
    const { items } = await searchJobPostings({ query: "", locale: "ig" });

    expect(items).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("returns [] for whitespace-only Igbo query without calling db", async () => {
    const { items } = await searchJobPostings({ query: "\t\n  ", locale: "ig" });

    expect(items).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});

describe("searchJobPostings — SQL structure (pass-through behavior)", () => {
  it("emits SQL containing the `status = 'active' AND archived_at IS NULL` filters", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostings({ query: "manager", locale: "en" });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const sqlArg = mockDbExecute.mock.calls[0]![0];
    const rendered = flattenSql(sqlArg);
    expect(rendered).toContain("status = 'active'");
    expect(rendered).toContain("archived_at IS NULL");
  });

  it("emits SQL referencing `search_vector` for English locale and `search_vector_igbo` for Igbo locale", async () => {
    mockDbExecute.mockResolvedValue([]);
    await searchJobPostings({ query: "engineer", locale: "en" });
    const enRendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(enRendered).toContain("search_vector @@");
    expect(enRendered).toContain("plainto_tsquery('english',");

    mockDbExecute.mockClear();
    mockDbExecute.mockResolvedValue([]);
    await searchJobPostings({ query: "ọrụ", locale: "ig" });
    const igRendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(igRendered).toContain("search_vector_igbo @@");
    expect(igRendered).toContain("plainto_tsquery('simple',");
  });

  it("returns all rows from db without application-layer filtering", async () => {
    // Verifies the function returns the raw db rows without post-processing filtering.
    // If the application layer mistakenly filtered by status, this would fail.
    mockDbExecute.mockResolvedValue([sampleRow, igboRow]);

    const { items } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items).toHaveLength(2);
    expect(items).toContainEqual(sampleRow);
    expect(items).toContainEqual(igboRow);
  });
});

describe("searchJobPostings — default limit", () => {
  it("uses limit=20 when not specified", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "developer", locale: "en" });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("LIMIT");
    expect(rendered).toContain("21"); // safeLimit+1 = 20+1
  });

  it("uses provided limit value", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "developer", locale: "en", limit: 10 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("11"); // safeLimit+1 = 10+1
  });
});

describe("searchJobPostings — limit clamping (server-side guard)", () => {
  it("clamps negative limits to 1 (prevents PostgreSQL LIMIT error)", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en", limit: -5 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // clamped to MIN_LIMIT=1; negative value must not appear in SQL
    expect(rendered).not.toContain("-5");
    expect(rendered).toContain("LIMIT");
  });

  it("clamps zero limit to 1 (PostgreSQL rejects LIMIT 0 for no-op queries)", async () => {
    mockDbExecute.mockResolvedValue([]);

    await searchJobPostings({ query: "engineer", locale: "en", limit: 0 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("LIMIT");
    // Zero was clamped up to 1
  });

  it("clamps excessively large limits to 100 (prevents unbounded result fetches)", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en", limit: 9999 });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // 9999 must not appear — clamped to MAX_LIMIT=100; SQL has LIMIT 101 (safeLimit+1)
    expect(rendered).not.toContain("9999");
    expect(rendered).toContain("101"); // 100+1
  });
});

// ---------------------------------------------------------------------------
// PREP-G: Cursor pagination tests
// ---------------------------------------------------------------------------

describe("cursor pagination — encode/decode round-trip", () => {
  it.each([
    {
      v: 1 as const,
      s: "relevance" as const,
      rank: 0.5,
      createdAt: "2026-04-16T00:00:00.000Z",
      id: "abc-123",
    },
    { v: 1 as const, s: "date" as const, createdAt: "2026-04-16T00:00:00.000Z", id: "abc-123" },
    { v: 1 as const, s: "salary_asc" as const, salaryMin: 100000, id: "abc-123" },
    { v: 1 as const, s: "salary_asc" as const, salaryMin: null, id: "abc-123" },
    { v: 1 as const, s: "salary_desc" as const, salaryMax: 150000, id: "abc-123" },
    { v: 1 as const, s: "salary_desc" as const, salaryMax: null, id: "abc-123" },
  ] satisfies JobSearchCursor[])(
    "round-trips $s mode (salaryMin=$salaryMin, salaryMax=$salaryMax)",
    (payload) => {
      expect(decodeJobSearchCursor(encodeJobSearchCursor(payload))).toEqual(payload);
    },
  );
});

describe("cursor pagination — decodeJobSearchCursor fail-safe", () => {
  it("returns null for empty string", () => {
    expect(decodeJobSearchCursor("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(decodeJobSearchCursor("   ")).toBeNull();
  });

  it("returns null for non-base64url string", () => {
    expect(decodeJobSearchCursor("not-valid-base64url!!!")).toBeNull();
  });

  it("returns null for valid base64url but non-JSON payload", () => {
    // base64url("this is not json")
    const notJson = Buffer.from("this is not json").toString("base64url");
    expect(decodeJobSearchCursor(notJson)).toBeNull();
  });

  it("returns null for valid JSON but missing v field", () => {
    const missingV = Buffer.from(
      JSON.stringify({ s: "date", createdAt: "2026-04-16T00:00:00.000Z", id: "abc" }),
    ).toString("base64url");
    expect(decodeJobSearchCursor(missingV)).toBeNull();
  });

  it("returns null for unknown version (v: 99)", () => {
    const unknownV = Buffer.from(
      JSON.stringify({ v: 99, s: "date", createdAt: "2026-04-16T00:00:00.000Z", id: "abc" }),
    ).toString("base64url");
    expect(decodeJobSearchCursor(unknownV)).toBeNull();
  });

  it("returns null for unknown sort mode", () => {
    const unknownS = Buffer.from(JSON.stringify({ v: 1, s: "popularity", id: "abc" })).toString(
      "base64url",
    );
    expect(decodeJobSearchCursor(unknownS)).toBeNull();
  });

  it("returns null when relevance cursor missing rank field", () => {
    const missingRank = Buffer.from(
      JSON.stringify({ v: 1, s: "relevance", createdAt: "2026-04-16T00:00:00.000Z", id: "abc" }),
    ).toString("base64url");
    expect(decodeJobSearchCursor(missingRank)).toBeNull();
  });

  it("returns null when relevance cursor missing createdAt field", () => {
    const missingCreatedAt = Buffer.from(
      JSON.stringify({ v: 1, s: "relevance", rank: 0.5, id: "abc" }),
    ).toString("base64url");
    expect(decodeJobSearchCursor(missingCreatedAt)).toBeNull();
  });

  it("returns null when date cursor missing createdAt field", () => {
    const missingCreatedAt = Buffer.from(JSON.stringify({ v: 1, s: "date", id: "abc" })).toString(
      "base64url",
    );
    expect(decodeJobSearchCursor(missingCreatedAt)).toBeNull();
  });
});

describe("cursor pagination — searchJobPostings without cursor", () => {
  it("produces SQL with no seek predicate for default (relevance) sort without cursor", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // ts_rank in ORDER BY but no cursor seek predicate values
    expect(rendered).toContain("ts_rank");
    expect(rendered).toContain("ORDER BY");
    // No cursor comparison: there should be no "< " involving rank
    // We check that no cursor-related values (like a rank number) appear in params
    expect(rendered).not.toContain("AND (");
  });

  it("emits date ORDER BY for sort=date without cursor", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en", sort: "date" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("created_at DESC");
    // ts_rank is always present in the SELECT projection (relevance column) — not in ORDER BY for date sort
    expect(rendered).toContain("ORDER BY pjp.created_at DESC, pjp.id::text ASC");
  });

  it("emits salary_asc ORDER BY for sort=salary_asc without cursor", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_asc" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_min ASC NULLS LAST");
  });

  it("emits salary_desc ORDER BY for sort=salary_desc without cursor", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_desc" });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_max DESC NULLS FIRST");
  });
});

describe("cursor pagination — seek predicate SQL structure per sort mode", () => {
  it("relevance sort: seek predicate contains ts_rank and created_at and id comparisons", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({
      v: 1,
      s: "relevance",
      rank: 0.83,
      createdAt: "2026-04-16T14:22:11.543Z",
      id: "018f2a1e-3b44-7b14-9e6f-4d7e5c2a1f88",
    });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "relevance", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("ts_rank");
    expect(rendered).toContain("created_at <");
    expect(rendered).toContain("id::text >");
    expect(rendered).toContain("0.83");
  });

  it("date sort: seek predicate contains created_at and id comparisons, ORDER BY does not use ts_rank", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({
      v: 1,
      s: "date",
      createdAt: "2026-04-16T14:22:11.543Z",
      id: "018f2a1e-3b44-7b14-9e6f-4d7e5c2a1f88",
    });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "date", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("created_at <");
    expect(rendered).toContain("id::text >");
    // ts_rank appears in SELECT projection (relevance column) but not in ORDER BY for date sort
    expect(rendered).toContain("ORDER BY pjp.created_at DESC, pjp.id::text ASC");
  });

  it("salary_asc sort (non-null cursor): seek predicate contains salary_min comparisons", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({
      v: 1,
      s: "salary_asc",
      salaryMin: 80000,
      id: "abc-123",
    });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_asc", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_min IS NOT NULL");
    expect(rendered).toContain("salary_min IS NULL");
    expect(rendered).toContain("80000");
  });

  it("salary_desc sort (non-null cursor): seek predicate contains salary_max comparisons", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({
      v: 1,
      s: "salary_desc",
      salaryMax: 150000,
      id: "abc-123",
    });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_desc", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_max IS NOT NULL");
    expect(rendered).toContain("150000");
  });
});

describe("cursor pagination — NULL salary cursor branches", () => {
  it("salary_asc with salaryMin=null: produces NULL-tail branch (salary_min IS NULL AND id::text > ...)", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({ v: 1, s: "salary_asc", salaryMin: null, id: "abc-123" });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_asc", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_min IS NULL");
    expect(rendered).toContain("id::text >");
    // Must NOT produce the non-null head branch (no salary_min IS NOT NULL in seek)
    expect(rendered).not.toContain("salary_min IS NOT NULL");
  });

  it("salary_desc with salaryMax=null: produces NULL-head branch (salary_max IS NULL AND id::text > ...)", async () => {
    mockDbExecute.mockResolvedValue([]);

    const cursor = encodeJobSearchCursor({
      v: 1,
      s: "salary_desc",
      salaryMax: null,
      id: "abc-123",
    });
    await searchJobPostings({ query: "engineer", locale: "en", sort: "salary_desc", cursor });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("salary_max IS NULL");
    expect(rendered).toContain("id::text >");
    // Must NOT produce the non-null body branch
    expect(rendered).not.toContain("salary_max IS NOT NULL");
  });
});

describe("cursor pagination — hasMore + nextCursor population", () => {
  it("returns nextCursor when db returns safeLimit+1 rows (hasMore=true)", async () => {
    // Default limit is 20; mock 21 rows
    const twentyOneRows: JobSearchResult[] = Array.from({ length: 21 }, (_, i) => ({
      ...sampleRow,
      id: `post-${i + 1}`,
      relevance: "0.85",
    }));
    mockDbExecute.mockResolvedValue(twentyOneRows);

    const { items, nextCursor } = await searchJobPostings({
      query: "engineer",
      locale: "en",
      sort: "relevance",
    });

    expect(items).toHaveLength(20); // sliced to safeLimit
    expect(nextCursor).not.toBeNull();
    // nextCursor should decode to a relevance cursor matching the last in-range row
    const decoded = decodeJobSearchCursor(nextCursor!);
    expect(decoded).not.toBeNull();
    expect(decoded?.s).toBe("relevance");
    expect(decoded?.id).toBe("post-20"); // last item, not the 21st
  });

  it("returns nextCursor=null when db returns exactly safeLimit rows (hasMore=false)", async () => {
    const twentyRows: JobSearchResult[] = Array.from({ length: 20 }, (_, i) => ({
      ...sampleRow,
      id: `post-${i + 1}`,
    }));
    mockDbExecute.mockResolvedValue(twentyRows);

    const { items, nextCursor } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items).toHaveLength(20);
    expect(nextCursor).toBeNull();
  });

  it("returns nextCursor=null when db returns fewer than safeLimit rows", async () => {
    mockDbExecute.mockResolvedValue([sampleRow, igboRow]);

    const { items, nextCursor } = await searchJobPostings({ query: "engineer", locale: "en" });

    expect(items).toHaveLength(2);
    expect(nextCursor).toBeNull();
  });

  it("date sort: nextCursor decodes to date cursor with correct id", async () => {
    const twoRows: JobSearchResult[] = [
      { ...sampleRow, id: "post-1", created_at: "2026-04-02T00:00:00.000Z" },
      { ...sampleRow, id: "post-2", created_at: "2026-04-01T00:00:00.000Z" },
    ];
    // limit=1, so safeLimit=1; return 2 rows → hasMore=true
    mockDbExecute.mockResolvedValue(twoRows);

    const { items, nextCursor } = await searchJobPostings({
      query: "engineer",
      locale: "en",
      sort: "date",
      limit: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("post-1");
    expect(nextCursor).not.toBeNull();
    const decoded = decodeJobSearchCursor(nextCursor!);
    expect(decoded?.s).toBe("date");
    expect(decoded?.id).toBe("post-1");
  });
});

describe("cursor pagination — sort-mode mismatch guard", () => {
  it("ignores cursor when cursor.s does not match requested sort mode (falls back to page 1)", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    // Cursor encoded with sort=relevance, but requesting sort=date
    const relevanceCursor = encodeJobSearchCursor({
      v: 1,
      s: "relevance",
      rank: 0.83,
      createdAt: "2026-04-16T14:22:11.543Z",
      id: "abc-123",
    });
    await searchJobPostings({
      query: "engineer",
      locale: "en",
      sort: "date",
      cursor: relevanceCursor,
    });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // No seek predicate — mismatch treated as no cursor
    expect(rendered).not.toContain("AND (");
    expect(rendered).toContain("ORDER BY pjp.created_at DESC");
  });

  it("ignores salary_asc cursor when requesting salary_desc sort", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    const salaryAscCursor = encodeJobSearchCursor({
      v: 1,
      s: "salary_asc",
      salaryMin: 80000,
      id: "abc-123",
    });
    await searchJobPostings({
      query: "engineer",
      locale: "en",
      sort: "salary_desc",
      cursor: salaryAscCursor,
    });

    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // No seek predicate from the salary_asc cursor — mismatch treated as no cursor
    // salary_min appears in SELECT projection but NOT in a seek predicate AND clause
    expect(rendered).not.toContain("AND (");
    expect(rendered).not.toContain("80000");
    expect(rendered).toContain("ORDER BY pjp.salary_max DESC NULLS FIRST");
  });
});

describe("cursor pagination — cursor tampering (fail-safe design)", () => {
  it("bogus cursor id still returns valid SQL — seek simply skips past an arbitrary point", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    // Craft a cursor with a nonsense UUID that doesn't exist in the DB
    const tamperedCursor = encodeJobSearchCursor({
      v: 1,
      s: "date",
      createdAt: "2020-01-01T00:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000000",
    });
    const { items } = await searchJobPostings({
      query: "engineer",
      locale: "en",
      sort: "date",
      cursor: tamperedCursor,
    });

    // No throw — db.execute was called and returned the mocked rows
    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(items).toHaveLength(1);
    // SQL contains the tampered values — no error path
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("created_at <");
    expect(rendered).toContain("2020-01-01T00:00:00.000Z");
  });

  it("completely garbled cursor string falls back to first page (no seek predicate)", async () => {
    mockDbExecute.mockResolvedValue([sampleRow]);

    const { items } = await searchJobPostings({
      query: "engineer",
      locale: "en",
      cursor: "totally-garbage-cursor-string",
    });

    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(items).toHaveLength(1);
    // No seek predicate in the SQL — garbled cursor decoded to null
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).not.toContain("AND (");
  });
});

// ---------------------------------------------------------------------------
// P-4.5 — getJobPostingsForMatching
// ---------------------------------------------------------------------------

import { getJobPostingsForMatching } from "./portal-job-search";

describe("getJobPostingsForMatching", () => {
  it("returns empty array for empty jobIds", async () => {
    const result = await getJobPostingsForMatching([]);
    expect(result).toEqual([]);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("returns minimal projection rows for provided IDs", async () => {
    const mockRows = [
      {
        id: "job-uuid-1",
        requirements: "JavaScript React",
        location: "Lagos, Nigeria",
        employmentType: "full_time",
      },
    ];
    mockDbExecute.mockResolvedValue(mockRows);

    const result = await getJobPostingsForMatching(["job-uuid-1"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "job-uuid-1",
      requirements: "JavaScript React",
      location: "Lagos, Nigeria",
      employmentType: "full_time",
    });
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("filters by status = active AND archived_at IS NULL (SQL contains both)", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getJobPostingsForMatching(["job-uuid-1"]);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("active");
    expect(rendered).toContain("archived_at");
  });

  it("respects the provided ID list in the query", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getJobPostingsForMatching(["uuid-a", "uuid-b"]);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("uuid-a");
    expect(rendered).toContain("uuid-b");
  });

  it("caps at 50 IDs (safety guard)", async () => {
    const manyIds = Array.from({ length: 60 }, (_, i) => `uuid-${i}`);
    mockDbExecute.mockResolvedValue([]);
    await getJobPostingsForMatching(manyIds);
    // Should still call execute with at most 50 IDs
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    // uuid-49 should be present (index 49 = 50th item), uuid-50 should not
    expect(rendered).toContain("uuid-49");
    expect(rendered).not.toContain("uuid-50");
  });
});

// ---------------------------------------------------------------------------
// findNewPostingsForAlert
// ---------------------------------------------------------------------------

describe("findNewPostingsForAlert", () => {
  const sinceTimestamp = new Date("2026-04-15T00:00:00Z");

  const sampleAlertRow = {
    id: "post-1",
    title: "Software Engineer",
    company_name: "Acme Corp",
    location: "Lagos",
  };

  it("returns mapped results with companyName field", async () => {
    mockDbExecute.mockResolvedValue([sampleAlertRow]);
    const results = await findNewPostingsForAlert({ query: "engineer" }, sinceTimestamp);
    expect(results).toEqual([
      { id: "post-1", title: "Software Engineer", companyName: "Acme Corp", location: "Lagos" },
    ]);
  });

  it("applies FTS query when query is present", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert({ query: "engineer" }, sinceTimestamp);
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("plainto_tsquery");
    expect(rendered).toContain("search_vector");
    expect(rendered).toContain("engineer");
  });

  it("omits FTS when query is empty", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert({ query: "" }, sinceTimestamp);
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).not.toContain("plainto_tsquery");
  });

  it("omits FTS when query is whitespace only", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert({ query: "   " }, sinceTimestamp);
    expect(mockDbExecute).toHaveBeenCalledOnce();
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).not.toContain("plainto_tsquery");
  });

  it("applies filter predicates when filters provided", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert(
      { query: null, filters: { location: ["Lagos"], employmentType: ["full_time"] } },
      sinceTimestamp,
    );
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("Lagos");
    expect(rendered).toContain("full_time");
  });

  it("includes updated_at > sinceTimestamp condition", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert({ query: "test" }, sinceTimestamp);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("updated_at >");
  });

  it("limits results to 20", async () => {
    mockDbExecute.mockResolvedValue([]);
    await findNewPostingsForAlert({}, sinceTimestamp);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("20");
  });

  it("handles null company_name in rows", async () => {
    mockDbExecute.mockResolvedValue([{ ...sampleAlertRow, company_name: null }]);
    const results = await findNewPostingsForAlert({}, sinceTimestamp);
    expect(results[0]!.companyName).toBeNull();
  });

  it("returns empty array when no matches", async () => {
    mockDbExecute.mockResolvedValue([]);
    const results = await findNewPostingsForAlert({ query: "nonexistent" }, sinceTimestamp);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractSimilarJobTokens
// ---------------------------------------------------------------------------

describe("extractSimilarJobTokens", () => {
  it("returns empty array for null", () => {
    expect(extractSimilarJobTokens(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractSimilarJobTokens("")).toEqual([]);
  });

  it("filters tokens shorter than 3 chars", () => {
    expect(extractSimilarJobTokens("a is it React")).toEqual(["react"]);
  });

  it("lowercases and deduplicates tokens", () => {
    const tokens = extractSimilarJobTokens("React react REACT TypeScript");
    expect(tokens).toEqual(["react", "typescript"]);
  });

  it("strips non-alphanumeric characters", () => {
    const tokens = extractSimilarJobTokens("React.js (TypeScript)");
    expect(tokens).toEqual(["reactjs", "typescript"]);
  });

  it("caps output at 20 tokens", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const tokens = extractSimilarJobTokens(words);
    expect(tokens.length).toBe(20);
  });

  it("handles whitespace-only input", () => {
    expect(extractSimilarJobTokens("   ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSimilarJobPostings
// ---------------------------------------------------------------------------

describe("getSimilarJobPostings", () => {
  const baseCandidate = {
    id: "post-2",
    title: "Backend Engineer",
    company_name: "Acme Corp",
    company_id: "company-2",
    logo_url: null,
    location: "Lagos, Nigeria",
    salary_min: 60000,
    salary_max: 90000,
    salary_competitive_only: false,
    employment_type: "full_time",
    cultural_context_json: null,
    application_deadline: null,
    created_at: "2026-04-10T00:00:00Z",
    requirements: "React TypeScript Node.js",
  };

  it("calls db.execute once and returns DiscoveryJobResult[] shape", async () => {
    mockDbExecute.mockResolvedValue([baseCandidate]);
    const results = await getSimilarJobPostings("post-1", "Technology", null, null);
    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "post-2",
      title: "Backend Engineer",
      company_name: "Acme Corp",
    });
    // requirements field must not be in the return shape
    expect(results[0]).not.toHaveProperty("requirements");
  });

  it("SQL includes INNER JOIN on company_profiles for industry filter", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getSimilarJobPostings("post-1", "Technology", null, null);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("INNER JOIN portal_company_profiles");
    expect(rendered).toContain("cp.industry");
    expect(rendered).toContain("Technology");
  });

  it("SQL excludes current posting by jobId", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getSimilarJobPostings("post-uuid-1", "Technology", null, null);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("post-uuid-1");
  });

  it("SQL includes status gate: active, not archived, not expired", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getSimilarJobPostings("post-1", "Technology", null, null);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("active");
    expect(rendered).toContain("archived_at IS NULL");
    expect(rendered).toContain("application_deadline IS NULL");
  });

  it("SQL includes LIMIT of 30 candidates", async () => {
    mockDbExecute.mockResolvedValue([]);
    await getSimilarJobPostings("post-1", "Technology", null, null);
    const rendered = flattenSql(mockDbExecute.mock.calls[0]![0]);
    expect(rendered).toContain("30");
  });

  it("respects the limit parameter, returning at most limit results", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      ...baseCandidate,
      id: `post-${i + 2}`,
    }));
    mockDbExecute.mockResolvedValue(candidates);
    const results = await getSimilarJobPostings("post-1", "Technology", null, null, 4);
    expect(results).toHaveLength(4);
  });

  it("ranks by keyword overlap DESC when source has requirements", async () => {
    const highOverlap = { ...baseCandidate, id: "high", requirements: "React TypeScript Node.js" };
    const lowOverlap = { ...baseCandidate, id: "low", requirements: "Python Django Flask" };
    // DB returns low before high (by created_at), scoring should reorder
    mockDbExecute.mockResolvedValue([lowOverlap, highOverlap]);
    const results = await getSimilarJobPostings("post-1", "Technology", "React TypeScript", null);
    expect(results[0]!.id).toBe("high");
    expect(results[1]!.id).toBe("low");
  });

  it("falls back to DB order when requirements is null (no keyword scoring)", async () => {
    const first = { ...baseCandidate, id: "first", created_at: "2026-04-15T00:00:00Z" };
    const second = { ...baseCandidate, id: "second", created_at: "2026-04-10T00:00:00Z" };
    mockDbExecute.mockResolvedValue([first, second]);
    const results = await getSimilarJobPostings("post-1", "Technology", null, null);
    // Same keyword overlap (0), same location score (0), so DB order preserved
    expect(results[0]!.id).toBe("first");
    expect(results[1]!.id).toBe("second");
  });

  it("applies location scoring when source location is provided", async () => {
    const exactMatch = { ...baseCandidate, id: "exact", location: "Lagos, Nigeria" };
    const noMatch = { ...baseCandidate, id: "none", location: "Nairobi, Kenya" };
    mockDbExecute.mockResolvedValue([noMatch, exactMatch]);
    const results = await getSimilarJobPostings("post-1", "Technology", null, "Lagos, Nigeria");
    expect(results[0]!.id).toBe("exact");
    expect(results[1]!.id).toBe("none");
  });

  it("returns empty array when db returns no candidates", async () => {
    mockDbExecute.mockResolvedValue([]);
    const results = await getSimilarJobPostings("post-1", "Technology", null, null);
    expect(results).toEqual([]);
  });
});
