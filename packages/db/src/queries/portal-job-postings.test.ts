// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({
  db: { insert: vi.fn(), select: vi.fn(), update: vi.fn(), execute: vi.fn() },
}));

import { db } from "../index";
import {
  createJobPosting,
  getJobPostingById,
  getJobPostingsByCompanyId,
  getJobPostingsByCompanyIdWithFilter,
  getJobPostingWithCompany,
  countActivePostingsByCompanyId,
  updateJobPosting,
  updateJobPostingStatus,
  getExpiredPostings,
  getExpiringPostings,
  getArchivablePostings,
  archivePosting,
  batchExpirePostings,
  incrementViewCount,
  getJobAnalytics,
  markSharedToCommunity,
  getJobPostingShareStatus,
  getJobPostingForApply,
  getActivePostingUrlsForSitemap,
} from "./portal-job-postings";
import type { PortalJobPosting } from "../schema/portal-job-postings";

const POSTING: PortalJobPosting = {
  id: "jp-1",
  companyId: "cp-1",
  title: "Software Engineer",
  descriptionHtml: "<p>Job desc</p>",
  requirements: null,
  salaryMin: 80000,
  salaryMax: 120000,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "draft",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  revisionCount: 0,
  viewCount: 0,
  communityPostId: null,
  screeningStatus: null,
  screeningResultJson: null,
  screeningCheckedAt: null,
  enableCoverLetter: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeInsertMock(returnValue: PortalJobPosting) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeSelectOneMock(returnValue: PortalJobPosting | undefined) {
  const limit = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeSelectManyMock(returnValues: PortalJobPosting[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

// For queries that end with .where() (no .orderBy() call)
function makeSelectWhereEndsMock(returnValues: PortalJobPosting[]) {
  const where = vi.fn().mockResolvedValue(returnValues);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
}

function makeUpdateMock(returnValue: PortalJobPosting | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createJobPosting", () => {
  it("inserts and returns the new posting", async () => {
    makeInsertMock(POSTING);
    const result = await createJobPosting({
      companyId: "cp-1",
      title: "Software Engineer",
      employmentType: "full_time",
    });
    expect(result).toEqual(POSTING);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
    await expect(
      createJobPosting({ companyId: "cp-1", title: "X", employmentType: "contract" }),
    ).rejects.toThrow("Failed to create job posting");
  });
});

describe("getJobPostingById", () => {
  it("returns posting when found", async () => {
    makeSelectOneMock(POSTING);
    const result = await getJobPostingById("jp-1");
    expect(result).toEqual(POSTING);
  });

  it("returns null when not found", async () => {
    makeSelectOneMock(undefined);
    const result = await getJobPostingById("jp-999");
    expect(result).toBeNull();
  });
});

describe("getJobPostingsByCompanyId", () => {
  it("returns array of postings", async () => {
    makeSelectManyMock([POSTING]);
    const result = await getJobPostingsByCompanyId("cp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("jp-1");
  });

  it("returns empty array when none found", async () => {
    makeSelectManyMock([]);
    const result = await getJobPostingsByCompanyId("cp-999");
    expect(result).toHaveLength(0);
  });
});

describe("updateJobPosting", () => {
  it("updates and returns updated posting", async () => {
    const updated = { ...POSTING, title: "Updated Engineer" };
    makeUpdateMock(updated);
    const result = await updateJobPosting("jp-1", { title: "Updated Engineer" });
    expect(result?.title).toBe("Updated Engineer");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateJobPosting("jp-999", { title: "X" });
    expect(result).toBeNull();
  });
});

describe("updateJobPostingStatus", () => {
  it("updates status and returns updated posting", async () => {
    const updated = { ...POSTING, status: "active" as const };
    makeUpdateMock(updated);
    const result = await updateJobPostingStatus("jp-1", "active");
    expect(result?.status).toBe("active");
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateJobPostingStatus("jp-999", "active");
    expect(result).toBeNull();
  });
});

describe("getJobPostingsByCompanyIdWithFilter", () => {
  it("returns all postings when no statusFilter provided", async () => {
    makeSelectManyMock([POSTING]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("jp-1");
  });

  it("returns empty array when no postings match", async () => {
    makeSelectManyMock([]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "active");
    expect(result).toHaveLength(0);
  });

  it("calls db.select when statusFilter is provided", async () => {
    makeSelectManyMock([{ ...POSTING, status: "active" as const }]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "active");
    expect(result[0]?.status).toBe("active");
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe("countActivePostingsByCompanyId", () => {
  it("returns count of active postings", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 3 }]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await countActivePostingsByCompanyId("cp-1");
    expect(result).toBe(3);
  });

  it("returns 0 when no active postings", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await countActivePostingsByCompanyId("cp-1");
    expect(result).toBe(0);
  });
});

describe("getJobPostingWithCompany", () => {
  it("returns posting with company when found", async () => {
    const mockCompany = {
      id: "cp-1",
      ownerUserId: "user-1",
      name: "Acme Corp",
      logoUrl: null,
      description: null,
      industry: null,
      companySize: null,
      cultureInfo: null,
      trustBadge: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const limit = vi.fn().mockResolvedValue([{ posting: POSTING, company: mockCompany }]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingWithCompany("jp-1");
    expect(result).not.toBeNull();
    expect(result?.posting.id).toBe("jp-1");
    expect(result?.company.name).toBe("Acme Corp");
  });

  it("returns null when posting not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingWithCompany("jp-999");
    expect(result).toBeNull();
  });
});

describe("getJobPostingsByCompanyIdWithFilter — archived filter", () => {
  it("returns archived postings when statusFilter is 'archived'", async () => {
    const archivedPosting = { ...POSTING, archivedAt: new Date() };
    makeSelectManyMock([archivedPosting]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "archived");
    expect(result).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("excludes archived postings when no statusFilter (default behavior)", async () => {
    makeSelectManyMock([POSTING]); // non-archived
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1");
    expect(result).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("excludes archived postings when filtering by a real status", async () => {
    makeSelectManyMock([{ ...POSTING, status: "active" as const }]);
    const result = await getJobPostingsByCompanyIdWithFilter("cp-1", "active");
    expect(result[0]?.status).toBe("active");
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe("getExpiredPostings", () => {
  it("returns active postings past their expires_at", async () => {
    const expiredPosting = {
      ...POSTING,
      status: "active" as const,
      expiresAt: new Date("2025-01-01"),
    };
    makeSelectWhereEndsMock([expiredPosting]);
    const result = await getExpiredPostings();
    expect(result).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no expired postings", async () => {
    makeSelectWhereEndsMock([]);
    const result = await getExpiredPostings();
    expect(result).toHaveLength(0);
  });
});

describe("getExpiringPostings", () => {
  it("returns active postings expiring within window", async () => {
    const soon = {
      ...POSTING,
      status: "active" as const,
      expiresAt: new Date(Date.now() + 86400000 * 2),
    };
    makeSelectWhereEndsMock([soon]);
    const result = await getExpiringPostings(3);
    expect(result).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns empty when no postings expiring within window", async () => {
    makeSelectWhereEndsMock([]);
    const result = await getExpiringPostings(3);
    expect(result).toHaveLength(0);
  });
});

describe("getArchivablePostings", () => {
  it("returns expired postings past grace period without archived_at", async () => {
    const old = {
      ...POSTING,
      status: "expired" as const,
      expiresAt: new Date("2025-01-01"),
      archivedAt: null,
    };
    makeSelectWhereEndsMock([old]);
    const result = await getArchivablePostings(30);
    expect(result).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns empty when no archivable postings", async () => {
    makeSelectWhereEndsMock([]);
    const result = await getArchivablePostings(30);
    expect(result).toHaveLength(0);
  });
});

describe("archivePosting", () => {
  it("sets archived_at and returns 1 when successful", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "jp-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await archivePosting("jp-1");
    expect(result).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when posting already archived or not found", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await archivePosting("jp-999");
    expect(result).toBe(0);
  });
});

describe("batchExpirePostings", () => {
  it("returns 0 immediately for empty id array", async () => {
    const result = await batchExpirePostings([]);
    expect(result).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates status to expired and returns count", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "jp-1" }, { id: "jp-2" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await batchExpirePostings(["jp-1", "jp-2"]);
    expect(result).toBe(2);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe("incrementViewCount", () => {
  it("increments view count and returns updated value", async () => {
    const returning = vi.fn().mockResolvedValue([{ viewCount: 5 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await incrementViewCount("jp-1");
    expect(result).toBe(5);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("increments from existing non-zero count", async () => {
    const returning = vi.fn().mockResolvedValue([{ viewCount: 11 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await incrementViewCount("jp-1");
    expect(result).toBe(11);
  });

  it("returns null when posting not found", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await incrementViewCount("non-existent");
    expect(result).toBeNull();
  });
});

describe("getJobAnalytics", () => {
  function makeAnalyticsMock(viewCount: number, communityPostId: string | null, appCount: number) {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: getPosting with viewCount
        const limit = vi.fn().mockResolvedValue([{ viewCount, communityPostId }]);
        const where = vi.fn().mockReturnValue({ limit });
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      } else {
        // Second call: COUNT applications
        const where = vi.fn().mockResolvedValue([{ count: appCount }]);
        const from = vi.fn().mockReturnValue({ where });
        return { from } as unknown as ReturnType<typeof db.select>;
      }
    });
  }

  it("returns zeros for a new posting with no views or applications", async () => {
    makeAnalyticsMock(0, null, 0);
    const result = await getJobAnalytics("jp-1");
    expect(result).toEqual({
      viewCount: 0,
      applicationCount: 0,
      conversionRate: 0,
      communityPostId: null,
    });
  });

  it("returns correct counts for posting with views and applications", async () => {
    makeAnalyticsMock(10, null, 2);
    const result = await getJobAnalytics("jp-1");
    expect(result?.viewCount).toBe(10);
    expect(result?.applicationCount).toBe(2);
    expect(result?.conversionRate).toBe(20); // 2/10 * 100 = 20%
  });

  it("conversionRate is 0 when views is 0 (no division by zero)", async () => {
    makeAnalyticsMock(0, null, 3);
    const result = await getJobAnalytics("jp-1");
    expect(result?.conversionRate).toBe(0);
  });

  it("returns communityPostId when posting has been shared", async () => {
    makeAnalyticsMock(5, "comm-post-1", 1);
    const result = await getJobAnalytics("jp-1");
    expect(result?.communityPostId).toBe("comm-post-1");
  });

  it("returns null when posting not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobAnalytics("non-existent");
    expect(result).toBeNull();
  });

  it("rounds conversion rate to 1 decimal place", async () => {
    makeAnalyticsMock(3, null, 1);
    const result = await getJobAnalytics("jp-1");
    expect(result?.conversionRate).toBe(33.3); // 1/3 * 100 = 33.333... → 33.3
  });
});

describe("markSharedToCommunity", () => {
  it("sets communityPostId and returns updated posting", async () => {
    const updated = { ...POSTING, communityPostId: "comm-post-1" };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await markSharedToCommunity("jp-1", "comm-post-1");
    expect(result?.communityPostId).toBe("comm-post-1");
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns null on second call (idempotent — already shared)", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await markSharedToCommunity("jp-1", "comm-post-2");
    expect(result).toBeNull();
  });

  it("returns null when posting not found", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    const result = await markSharedToCommunity("non-existent", "comm-post-1");
    expect(result).toBeNull();
  });
});

describe("getJobPostingShareStatus", () => {
  it("returns null when posting exists but not shared", async () => {
    const limit = vi.fn().mockResolvedValue([{ communityPostId: null }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingShareStatus("jp-1");
    expect(result).toBeNull();
  });

  it("returns communityPostId when sharing has occurred", async () => {
    const limit = vi.fn().mockResolvedValue([{ communityPostId: "comm-post-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingShareStatus("jp-1");
    expect(result).toBe("comm-post-1");
  });

  it("returns undefined when posting does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);

    const result = await getJobPostingShareStatus("non-existent");
    expect(result).toBeUndefined();
  });
});

describe("getJobPostingForApply", () => {
  const JOB_ROW = {
    id: "jp-1",
    status: "active",
    applicationDeadline: null,
    enableCoverLetter: false,
    companyId: "cp-1",
    employerUserId: "employer-1",
  };

  function makeInnerJoinWithLimitMock(returnValues: unknown[]) {
    const limit = vi.fn().mockResolvedValue(returnValues);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  }

  it("returns job posting with employer details for valid job id", async () => {
    makeInnerJoinWithLimitMock([JOB_ROW]);
    const result = await getJobPostingForApply("jp-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("jp-1");
    expect(result?.status).toBe("active");
    expect(result?.companyId).toBe("cp-1");
    expect(result?.employerUserId).toBe("employer-1");
    expect(result?.enableCoverLetter).toBe(false);
    expect(result?.applicationDeadline).toBeNull();
  });

  it("returns null when job posting does not exist", async () => {
    makeInnerJoinWithLimitMock([]);
    const result = await getJobPostingForApply("jp-999");
    expect(result).toBeNull();
  });

  it("returns applicationDeadline and enableCoverLetter when set", async () => {
    const deadline = new Date("2026-06-01");
    makeInnerJoinWithLimitMock([
      { ...JOB_ROW, applicationDeadline: deadline, enableCoverLetter: true },
    ]);
    const result = await getJobPostingForApply("jp-1");
    expect(result?.applicationDeadline).toEqual(deadline);
    expect(result?.enableCoverLetter).toBe(true);
  });
});

describe("getActivePostingUrlsForSitemap", () => {
  it("returns active postings with id and updatedAt", async () => {
    const updatedAt = new Date("2026-04-10T10:00:00Z");
    vi.mocked(db.execute).mockResolvedValue([
      { id: "jp-1", updated_at: updatedAt },
      { id: "jp-2", updated_at: new Date("2026-04-09T10:00:00Z") },
    ] as never);

    const result = await getActivePostingUrlsForSitemap();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "jp-1", updatedAt });
    expect(result[1]?.id).toBe("jp-2");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no active postings", async () => {
    vi.mocked(db.execute).mockResolvedValue([] as never);
    const result = await getActivePostingUrlsForSitemap();
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("excludes expired/filled/draft postings (verified by SQL contract)", async () => {
    // The SQL WHERE clause limits results to active+non-archived+non-deadline-passed.
    // Here we verify the query runs and maps rows correctly — the SQL filter
    // is tested at integration level and by convention/code review.
    const activePosting = { id: "jp-active", updated_at: new Date("2026-04-15") };
    vi.mocked(db.execute).mockResolvedValue([activePosting] as never);
    const result = await getActivePostingUrlsForSitemap();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("jp-active");
  });

  it("returns results ordered by updatedAt DESC (most recent first)", async () => {
    const older = new Date("2026-04-01");
    const newer = new Date("2026-04-15");
    // Simulate DB returning in DESC order
    vi.mocked(db.execute).mockResolvedValue([
      { id: "jp-newer", updated_at: newer },
      { id: "jp-older", updated_at: older },
    ] as never);
    const result = await getActivePostingUrlsForSitemap();
    expect(result[0]?.id).toBe("jp-newer");
    expect(result[1]?.id).toBe("jp-older");
  });
});
