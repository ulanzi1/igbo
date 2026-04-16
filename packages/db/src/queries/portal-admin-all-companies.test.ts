// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../schema/portal-company-profiles", () => ({
  portalCompanyProfiles: {
    id: "pcp_id",
    ownerUserId: "pcp_owner_user_id",
    name: "pcp_name",
    trustBadge: "pcp_trust_badge",
    createdAt: "pcp_created_at",
  },
}));

vi.mock("../schema/portal-employer-verifications", () => ({
  portalEmployerVerifications: {
    status: "pev_status",
    companyId: "pev_company_id",
    createdAt: "pev_created_at",
  },
}));

vi.mock("../schema/portal-admin-flags", () => ({
  portalAdminFlags: {
    status: "paf_status",
    postingId: "paf_posting_id",
  },
}));

vi.mock("../schema/portal-job-postings", () => ({
  portalJobPostings: {
    id: "pjp_id",
    companyId: "pjp_company_id",
    status: "pjp_status",
    archivedAt: "pjp_archived_at",
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    id: "au_id",
    name: "au_name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  count: vi.fn(() => ({ count: true })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => ({
      sql: strings.join("?"),
    })),
    {
      raw: vi.fn((s: string) => ({ sqlRaw: s })),
    },
  ),
}));

import { db } from "../index";
import { listAllCompaniesForAdmin } from "./portal-admin-all-companies";

// Helper to build a mock company row
function buildRow(
  overrides?: Partial<{
    id: string;
    name: string;
    trustBadge: boolean;
    ownerName: string | null;
    createdAt: Date;
    latestVerificationStatus: string | null;
    activePostingCount: number;
    openViolationCount: number;
  }>,
) {
  return {
    id: "company-1",
    name: "Tech Corp",
    trustBadge: false,
    ownerName: "Jane Doe",
    createdAt: new Date("2026-01-01"),
    latestVerificationStatus: null,
    activePostingCount: 3,
    openViolationCount: 0,
    ...overrides,
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAllCompaniesForAdmin", () => {
  it("returns all companies when no filters provided", async () => {
    const row1 = buildRow({ id: "c1", name: "Alpha Ltd" });
    const row2 = buildRow({
      id: "c2",
      name: "Beta Inc",
      trustBadge: true,
      latestVerificationStatus: "approved",
    });
    setupSelectChain([[row1, row2], [{ total: 2 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("returns correct shape for each row", async () => {
    const row = buildRow({
      id: "c1",
      name: "Tech Corp",
      trustBadge: true,
      ownerName: "John Smith",
      createdAt: new Date("2026-03-15"),
      latestVerificationStatus: "approved",
      activePostingCount: 5,
      openViolationCount: 2,
    });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });
    const company = result.companies[0]!;

    expect(company.id).toBe("c1");
    expect(company.name).toBe("Tech Corp");
    expect(company.trustBadge).toBe(true);
    expect(company.ownerName).toBe("John Smith");
    expect(company.activePostingCount).toBe(5);
    expect(company.openViolationCount).toBe(2);
    expect(company.createdAt).toEqual(new Date("2026-03-15"));
  });

  it("derives verificationDisplayStatus: trustBadge=true -> 'verified'", async () => {
    const row = buildRow({ trustBadge: true, latestVerificationStatus: null });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.verificationDisplayStatus).toBe("verified");
  });

  it("derives verificationDisplayStatus: trustBadge=false + latest pending -> 'pending'", async () => {
    const row = buildRow({ trustBadge: false, latestVerificationStatus: "pending" });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.verificationDisplayStatus).toBe("pending");
  });

  it("derives verificationDisplayStatus: trustBadge=false + latest rejected -> 'rejected'", async () => {
    const row = buildRow({ trustBadge: false, latestVerificationStatus: "rejected" });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.verificationDisplayStatus).toBe("rejected");
  });

  it("derives verificationDisplayStatus: no verifications + no trustBadge -> 'unverified'", async () => {
    const row = buildRow({ trustBadge: false, latestVerificationStatus: null });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.verificationDisplayStatus).toBe("unverified");
  });

  it("derives verificationDisplayStatus: approved verification + no trustBadge -> 'unverified'", async () => {
    // approved but trustBadge not set (edge case) -> unverified
    const row = buildRow({ trustBadge: false, latestVerificationStatus: "approved" });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.verificationDisplayStatus).toBe("unverified");
  });

  it("applies verification filter: 'verified' -> calls eq with trustBadge=true", async () => {
    setupSelectChain([[buildRow({ trustBadge: true })], [{ total: 1 }]]);

    await listAllCompaniesForAdmin({ page: 1, pageSize: 20, verification: "verified" });

    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("applies verification filter: 'unverified' -> calls eq with trustBadge=false and isNull", async () => {
    setupSelectChain([[buildRow()], [{ total: 1 }]]);

    await listAllCompaniesForAdmin({ page: 1, pageSize: 20, verification: "unverified" });

    const { eq, isNull } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), false);
    expect(isNull).toHaveBeenCalled();
  });

  it("applies verification filter: 'pending' -> calls eq with trustBadge=false and sql condition", async () => {
    setupSelectChain([[buildRow({ latestVerificationStatus: "pending" })], [{ total: 1 }]]);

    await listAllCompaniesForAdmin({ page: 1, pageSize: 20, verification: "pending" });

    const { eq } = await import("drizzle-orm");
    expect(eq).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("active posting count uses numeric value (not string)", async () => {
    const row = buildRow({ activePostingCount: 7, openViolationCount: 0 });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(typeof result.companies[0]!.activePostingCount).toBe("number");
    expect(result.companies[0]!.activePostingCount).toBe(7);
  });

  it("open violation count > 0 is reflected correctly", async () => {
    const row = buildRow({ openViolationCount: 3 });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.openViolationCount).toBe(3);
  });

  it("handles null ownerName gracefully", async () => {
    const row = buildRow({ ownerName: null });
    setupSelectChain([[row], [{ total: 1 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies[0]!.ownerName).toBeNull();
  });

  it("paginates correctly: page 1 of 3", async () => {
    setupSelectChain([[buildRow()], [{ total: 50 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.page).toBe(1);
    expect(result.total).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it("paginates correctly: page 2", async () => {
    setupSelectChain([[buildRow()], [{ total: 50 }]]);

    const result = await listAllCompaniesForAdmin({ page: 2, pageSize: 20 });

    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it("orders by createdAt DESC (newest first)", async () => {
    setupSelectChain([[buildRow()], [{ total: 1 }]]);

    await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    const { desc } = await import("drizzle-orm");
    expect(desc).toHaveBeenCalledWith(expect.anything());
  });

  it("returns empty result when no companies match", async () => {
    setupSelectChain([[], [{ total: 0 }]]);

    const result = await listAllCompaniesForAdmin({ page: 1, pageSize: 20 });

    expect(result.companies).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});
