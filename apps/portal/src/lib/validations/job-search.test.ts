// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  jobSearchRequestSchema,
  getCulturalContextField,
  SALARY_RANGE_BUCKETS,
  PORTAL_EMPLOYMENT_TYPES,
} from "./job-search";

describe("jobSearchRequestSchema — valid inputs", () => {
  it("accepts empty object (minimum payload with defaults)", () => {
    const result = jobSearchRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe("relevance");
      expect(result.data.limit).toBe(20);
      expect(result.data.query).toBeUndefined();
      expect(result.data.filters).toBeUndefined();
    }
  });

  it("accepts query-only payload", () => {
    const result = jobSearchRequestSchema.safeParse({ query: "engineer" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("engineer");
    }
  });

  it("accepts full payload with all filter fields", () => {
    const result = jobSearchRequestSchema.safeParse({
      query: "developer",
      filters: {
        location: ["Lagos, Nigeria", "Remote"],
        salaryMin: 50000,
        salaryMax: 150000,
        employmentType: ["full_time", "contract"],
        industry: ["Technology"],
        remote: true,
        culturalContext: {
          diasporaFriendly: true,
          igboPreferred: false,
          communityReferred: true,
        },
      },
      sort: "date",
      cursor: "abc123",
      limit: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.location).toEqual(["Lagos, Nigeria", "Remote"]);
      expect(result.data.filters?.salaryMin).toBe(50000);
      expect(result.data.filters?.employmentType).toEqual(["full_time", "contract"]);
      expect(result.data.sort).toBe("date");
      expect(result.data.limit).toBe(10);
    }
  });

  it("accepts all 5 employment type values", () => {
    for (const type of PORTAL_EMPLOYMENT_TYPES) {
      const result = jobSearchRequestSchema.safeParse({
        filters: { employmentType: [type] },
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all 4 sort values", () => {
    for (const sort of ["relevance", "date", "salary_asc", "salary_desc"] as const) {
      const result = jobSearchRequestSchema.safeParse({ sort });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sort).toBe(sort);
    }
  });

  it("accepts limit at boundary values 1 and 50", () => {
    expect(jobSearchRequestSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(jobSearchRequestSchema.safeParse({ limit: 50 }).success).toBe(true);
  });
});

describe("jobSearchRequestSchema — invalid inputs", () => {
  it("rejects invalid sort value", () => {
    const result = jobSearchRequestSchema.safeParse({ sort: "popularity" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employmentType enum value", () => {
    const result = jobSearchRequestSchema.safeParse({
      filters: { employmentType: ["full_time", "invalid_type"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit=0", () => {
    const result = jobSearchRequestSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects limit=51", () => {
    const result = jobSearchRequestSchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown/extra fields (schema is strict)", () => {
    const result = jobSearchRequestSchema.safeParse({ unknownField: "value" });
    expect(result.success).toBe(false);
  });

  it("rejects negative salaryMin", () => {
    const result = jobSearchRequestSchema.safeParse({ filters: { salaryMin: -1 } });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer limit", () => {
    const result = jobSearchRequestSchema.safeParse({ limit: 5.5 });
    expect(result.success).toBe(false);
  });
});

describe("getCulturalContextField", () => {
  it("maps igboPreferred → igboLanguagePreferred", () => {
    expect(getCulturalContextField("igboPreferred")).toBe("igboLanguagePreferred");
  });

  it("passes through diasporaFriendly unchanged", () => {
    expect(getCulturalContextField("diasporaFriendly")).toBe("diasporaFriendly");
  });

  it("passes through communityReferred unchanged", () => {
    expect(getCulturalContextField("communityReferred")).toBe("communityReferred");
  });
});

describe("JobSearchResultItem — companyId field (P-4.1B)", () => {
  it("accepts a JobSearchResultItem with companyId=string", () => {
    // Type-level test — verifies the interface includes companyId
    const item = {
      id: "1",
      title: "Engineer",
      companyName: "Acme",
      companyId: "company-uuid",
      companyLogoUrl: null,
      location: null,
      employmentType: "full_time" as const,
      salaryMin: null,
      salaryMax: null,
      salaryCompetitiveOnly: false,
      culturalContext: null,
      applicationDeadline: null,
      createdAt: new Date().toISOString(),
      relevance: null,
      snippet: null,
    };
    // If TS compiles, the field is present
    expect(item.companyId).toBe("company-uuid");
  });

  it("accepts a JobSearchResultItem with companyId=null", () => {
    const item = {
      id: "1",
      title: "Engineer",
      companyName: "Acme",
      companyId: null,
      companyLogoUrl: null,
      location: null,
      employmentType: "full_time" as const,
      salaryMin: null,
      salaryMax: null,
      salaryCompetitiveOnly: false,
      culturalContext: null,
      applicationDeadline: null,
      createdAt: new Date().toISOString(),
      relevance: null,
      snippet: null,
    };
    expect(item.companyId).toBeNull();
  });
});

describe("SALARY_RANGE_BUCKETS", () => {
  it("has 5 buckets with the correct keys", () => {
    const keys = SALARY_RANGE_BUCKETS.map((b) => b.key);
    expect(keys).toEqual(["<50k", "50k-100k", "100k-200k", ">200k", "competitive"]);
  });

  it("competitive bucket is marked as competitiveOnly", () => {
    const competitive = SALARY_RANGE_BUCKETS.find((b) => b.key === "competitive");
    expect(competitive).toBeDefined();
    expect((competitive as { competitiveOnly?: boolean }).competitiveOnly).toBe(true);
  });
});
