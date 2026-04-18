// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
}));

vi.mock("../schema/portal-job-postings", () => ({
  portalJobPostings: {
    id: "pjp_id",
    companyId: "pjp_company_id",
    title: "pjp_title",
    status: "pjp_status",
    location: "pjp_location",
    employmentType: "pjp_employment_type",
    archivedAt: "pjp_archived_at",
    createdAt: "pjp_created_at",
    updatedAt: "pjp_updated_at",
    applicationDeadline: "pjp_application_deadline",
  },
  portalJobStatusEnum: {
    enumValues: ["draft", "pending_review", "active", "paused", "filled", "expired", "rejected"],
  },
}));

vi.mock("../schema/portal-company-profiles", () => ({
  portalCompanyProfiles: {
    id: "pcp_id",
    ownerUserId: "pcp_owner_user_id",
    name: "pcp_name",
    trustBadge: "pcp_trust_badge",
    createdAt: "pcp_created_at",
    updatedAt: "pcp_updated_at",
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    id: "au_id",
    name: "au_name",
    email: "au_email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  lte: vi.fn((col: unknown, val: unknown) => ({ lte: [col, val] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  isNotNull: vi.fn((col: unknown) => ({ isNotNull: col })),
  count: vi.fn(() => ({ count: true })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

import { db } from "../index";
import { listAllPostingsForAdmin, getCompaniesWithPostings } from "./portal-admin-all-postings";

const BASE_ROW = {
  id: "posting-1",
  title: "Software Engineer",
  status: "active" as const,
  location: "Lagos",
  employmentType: "full_time",
  archivedAt: null,
  createdAt: new Date("2026-03-01"),
  companyId: "company-1",
  companyName: "Tech Corp",
  companyTrustBadge: true,
  employerName: "John Doe",
  applicationDeadline: new Date("2026-05-01T23:59:59.999Z"),
};

const BASE_ROW_2 = {
  id: "posting-2",
  title: "UX Designer",
  status: "pending_review" as const,
  location: "Abuja",
  employmentType: "contract",
  archivedAt: null,
  createdAt: new Date("2026-02-01"),
  companyId: "company-2",
  companyName: "Design Studio",
  companyTrustBadge: false,
  employerName: "Jane Smith",
  applicationDeadline: null,
};

function setupSelectChain(responses: unknown[]) {
  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const resp = responses[callIndex] ?? [];
    callIndex++;
    return {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(resp),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resp).then(resolve),
    };
  });
}

function setupSelectDistinctChain(response: unknown) {
  (db.selectDistinct as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(response),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAllPostingsForAdmin", () => {
  it("returns all postings when no filters provided", async () => {
    setupSelectChain([[BASE_ROW, BASE_ROW_2], [{ total: 2 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.postings).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("returns postings with correct shape", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    const posting = result.postings[0]!;
    expect(posting.id).toBe("posting-1");
    expect(posting.title).toBe("Software Engineer");
    expect(posting.status).toBe("active");
    expect(posting.location).toBe("Lagos");
    expect(posting.companyName).toBe("Tech Corp");
    expect(posting.companyTrustBadge).toBe(true);
    expect(posting.employerName).toBe("John Doe");
  });

  it("handles null location and employerName gracefully", async () => {
    const rowWithNulls = { ...BASE_ROW, location: null, employerName: null };
    setupSelectChain([[rowWithNulls], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.postings[0]?.location).toBeNull();
    expect(result.postings[0]?.employerName).toBeNull();
  });

  it("filters by status (active) — passes status condition to where", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20, status: "active" });

    expect(result.postings).toHaveLength(1);
    // The drizzle-orm mocks record what was called
    const { eq, isNull } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), "active");
    expect(isNull).toHaveBeenCalledWith(expect.anything());
  });

  it("filters by status (archived) — uses isNotNull on archivedAt", async () => {
    const archivedRow = { ...BASE_ROW, archivedAt: new Date("2026-02-15") };
    setupSelectChain([[archivedRow], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20, status: "archived" });

    expect(result.postings[0]?.archivedAt).toEqual(new Date("2026-02-15"));
    const { isNotNull } = await import("drizzle-orm");
    expect(isNotNull).toHaveBeenCalledWith(expect.anything());
  });

  it("filters by status (pending_review)", async () => {
    const pendingRow = { ...BASE_ROW, status: "pending_review" as const };
    setupSelectChain([[pendingRow], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({
      page: 1,
      pageSize: 20,
      status: "pending_review",
    });

    expect(result.postings[0]?.status).toBe("pending_review");
    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), "pending_review");
  });

  it("filters by companyId", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);

    await listAllPostingsForAdmin({ page: 1, pageSize: 20, companyId: "company-1" });

    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), "company-1");
  });

  it("filters by dateFrom", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);
    const dateFrom = new Date("2026-01-01");

    await listAllPostingsForAdmin({ page: 1, pageSize: 20, dateFrom });

    const { gte } = await import("drizzle-orm");
    expect(gte).toHaveBeenCalledWith(expect.anything(), dateFrom);
  });

  it("filters by dateTo", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);
    const dateTo = new Date("2026-03-31");

    await listAllPostingsForAdmin({ page: 1, pageSize: 20, dateTo });

    const { lte } = await import("drizzle-orm");
    expect(lte).toHaveBeenCalledWith(expect.anything(), dateTo);
  });

  it("combines multiple filters (status + companyId + dateFrom)", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({
      page: 1,
      pageSize: 20,
      status: "active",
      companyId: "company-1",
      dateFrom: new Date("2026-01-01"),
    });

    expect(result.postings).toHaveLength(1);
    const { and } = await import("drizzle-orm");
    expect(and).toHaveBeenCalled();
  });

  it("paginates correctly: page 1", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 50 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.page).toBe(1);
    expect(result.total).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it("paginates correctly: page 2", async () => {
    setupSelectChain([[BASE_ROW_2], [{ total: 50 }]]);

    const result = await listAllPostingsForAdmin({ page: 2, pageSize: 20 });

    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it("returns empty result when no postings match", async () => {
    setupSelectChain([[], [{ total: 0 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.postings).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  it("orders by createdAt DESC (newest first)", async () => {
    setupSelectChain([[BASE_ROW, BASE_ROW_2], [{ total: 2 }]]);

    await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    const { desc } = await import("drizzle-orm");
    expect(desc).toHaveBeenCalledWith(expect.anything());
  });
});

describe("getCompaniesWithPostings", () => {
  it("returns companies with postings sorted by name", async () => {
    setupSelectDistinctChain([
      { id: "c1", name: "Acme Corp" },
      { id: "c2", name: "Beta Ltd" },
    ]);

    const result = await getCompaniesWithPostings();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "c1", name: "Acme Corp" });
    expect(result[1]).toEqual({ id: "c2", name: "Beta Ltd" });
  });

  it("returns empty array when no companies have postings", async () => {
    setupSelectDistinctChain([]);

    const result = await getCompaniesWithPostings();

    expect(result).toHaveLength(0);
  });

  it("returns applicationDeadline in posting shape", async () => {
    setupSelectChain([[BASE_ROW], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.postings[0]?.applicationDeadline).toEqual(new Date("2026-05-01T23:59:59.999Z"));
  });

  it("returns null applicationDeadline when not set", async () => {
    setupSelectChain([[BASE_ROW_2], [{ total: 1 }]]);

    const result = await listAllPostingsForAdmin({ page: 1, pageSize: 20 });

    expect(result.postings[0]?.applicationDeadline).toBeNull();
  });

  it("uses innerJoin so companies without postings are excluded", async () => {
    setupSelectDistinctChain([]);

    await getCompaniesWithPostings();

    expect(db.selectDistinct).toHaveBeenCalled();
    // Inner join used — companies without postings won't appear
    const chain = (db.selectDistinct as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(chain.innerJoin).toHaveBeenCalled();
  });
});
