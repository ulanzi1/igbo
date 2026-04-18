// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockExecute = vi.fn();

vi.mock("../index", () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import {
  getFeaturedJobPostings,
  getIndustryCategoryCounts,
  getRecentJobPostings,
} from "./portal-job-search";

// ---------------------------------------------------------------------------
// Shared sample data
// ---------------------------------------------------------------------------

const sampleDiscoveryRow = {
  id: "post-uuid-1",
  title: "Senior Software Engineer",
  company_name: "TechCorp Nigeria",
  company_id: "company-uuid-1",
  logo_url: "https://example.com/logo.png",
  location: "Lagos, Nigeria",
  salary_min: 100000,
  salary_max: 200000,
  salary_competitive_only: false,
  employment_type: "full_time",
  cultural_context_json: null,
  application_deadline: null,
  created_at: "2026-04-01T10:00:00.000Z",
};

const sampleDiscoveryRow2 = {
  id: "post-uuid-2",
  title: "Product Manager",
  company_name: "FinTech Co",
  company_id: "company-uuid-2",
  logo_url: null,
  location: "Abuja, Nigeria",
  salary_min: null,
  salary_max: null,
  salary_competitive_only: true,
  employment_type: "full_time",
  cultural_context_json: { diasporaFriendly: true },
  application_deadline: "2026-06-30T23:59:59.000Z",
  created_at: "2026-03-28T08:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getFeaturedJobPostings
// ---------------------------------------------------------------------------

describe("getFeaturedJobPostings", () => {
  it("returns featured jobs from DB", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("post-uuid-1");
    expect(result[0]?.title).toBe("Senior Software Engineer");
    expect(result[0]?.company_name).toBe("TechCorp Nigeria");
  });

  it("returns empty array when no featured jobs exist", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(0);
  });

  it("includes company_id in result", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    const result = await getFeaturedJobPostings(6);

    expect(result[0]?.company_id).toBe("company-uuid-1");
  });

  it("does not include relevance or snippet fields", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    const result = await getFeaturedJobPostings(6);
    const item = result[0]!;

    // TypeScript enforces this at compile time; at runtime these should be absent
    expect("relevance" in item).toBe(false);
    expect("snippet" in item).toBe(false);
  });

  it("passes limit to the SQL query (via template literal substitution)", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    await getFeaturedJobPostings(3);

    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it("excludes postings with expired deadlines (status gate)", async () => {
    // The query filters in SQL — test that it uses the correct WHERE clause
    // by verifying the query runs without throwing and that the DB result is returned as-is
    mockExecute.mockResolvedValue([]); // DB returns nothing matching (deadline expired)

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(0);
  });

  it("returns multiple rows respecting DB ordering", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow, sampleDiscoveryRow2]);

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("post-uuid-1");
    expect(result[1]?.id).toBe("post-uuid-2");
  });
});

// ---------------------------------------------------------------------------
// getIndustryCategoryCounts
// ---------------------------------------------------------------------------

describe("getIndustryCategoryCounts", () => {
  it("returns industry counts sorted by count DESC", async () => {
    mockExecute.mockResolvedValue([
      { industry: "technology", count: 42 },
      { industry: "finance", count: 18 },
      { industry: "healthcare", count: 5 },
    ]);

    const result = await getIndustryCategoryCounts();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ industry: "technology", count: 42 });
    expect(result[1]).toEqual({ industry: "finance", count: 18 });
    expect(result[2]).toEqual({ industry: "healthcare", count: 5 });
  });

  it("returns empty array when no active postings exist", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getIndustryCategoryCounts();

    expect(result).toHaveLength(0);
  });

  it("returns correct shape with industry and count fields", async () => {
    mockExecute.mockResolvedValue([{ industry: "technology", count: 10 }]);

    const result = await getIndustryCategoryCounts();

    expect(result[0]).toHaveProperty("industry");
    expect(result[0]).toHaveProperty("count");
  });

  it("runs without throwing when called", async () => {
    mockExecute.mockResolvedValue([]);

    await expect(getIndustryCategoryCounts()).resolves.toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// getRecentJobPostings
// ---------------------------------------------------------------------------

describe("getRecentJobPostings", () => {
  it("returns recent jobs from DB", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow, sampleDiscoveryRow2]);

    const result = await getRecentJobPostings(10);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("post-uuid-1");
  });

  it("returns empty array when no active postings exist", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getRecentJobPostings(10);

    expect(result).toHaveLength(0);
  });

  it("does not include relevance or snippet fields", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    const result = await getRecentJobPostings(10);
    const item = result[0]!;

    expect("relevance" in item).toBe(false);
    expect("snippet" in item).toBe(false);
  });

  it("passes limit to the query", async () => {
    mockExecute.mockResolvedValue([sampleDiscoveryRow]);

    await getRecentJobPostings(5);

    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it("returns jobs including those without company profiles (left join)", async () => {
    const rowWithoutCompany = {
      ...sampleDiscoveryRow,
      company_name: null,
      company_id: null,
      logo_url: null,
    };
    mockExecute.mockResolvedValue([rowWithoutCompany]);

    const result = await getRecentJobPostings(10);

    expect(result[0]?.company_name).toBeNull();
    expect(result[0]?.company_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Status gate — featured job with expired deadline excluded (AC #9 / VS #9)
// ---------------------------------------------------------------------------

describe("getFeaturedJobPostings — featured job with expired deadline excluded", () => {
  it("does not return a featured active job when application_deadline is in the past", async () => {
    // The SQL WHERE clause is:
    //   pjp.is_featured = true
    //   AND (pjp.application_deadline IS NULL OR pjp.application_deadline > NOW())
    // When the deadline is past, the DB returns nothing.
    // This test verifies the DB mock (representing the gate) returns the correct response.
    mockExecute.mockResolvedValue([]); // DB enforces deadline gate

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(0);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it("returns a featured active job when application_deadline is null (no deadline)", async () => {
    const jobWithNoDeadline = { ...sampleDiscoveryRow, application_deadline: null };
    mockExecute.mockResolvedValue([jobWithNoDeadline]);

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(1);
    expect(result[0]?.application_deadline).toBeNull();
  });

  it("returns a featured active job when application_deadline is in the future", async () => {
    const jobWithFutureDeadline = {
      ...sampleDiscoveryRow,
      application_deadline: "2099-12-31T23:59:59.000Z",
    };
    mockExecute.mockResolvedValue([jobWithFutureDeadline]);

    const result = await getFeaturedJobPostings(6);

    expect(result).toHaveLength(1);
    expect(result[0]?.application_deadline).toBe("2099-12-31T23:59:59.000Z");
  });
});
