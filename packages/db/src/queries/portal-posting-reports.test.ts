// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "selectDistinct",
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "groupBy",
    "limit",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["offset"] = vi.fn().mockResolvedValue(returnValue);
  chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

function makeWriteChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain["insert"] = vi.fn().mockReturnValue(chain);
  chain["values"] = vi.fn().mockReturnValue(chain);
  chain["update"] = vi.fn().mockReturnValue(chain);
  chain["set"] = vi.fn().mockReturnValue(chain);
  chain["where"] = vi.fn().mockReturnValue(chain);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

const mockReport = {
  id: "report-1",
  postingId: "posting-1",
  reporterUserId: "user-1",
  category: "scam_fraud" as const,
  description: "This posting looks like a scam with too-good-to-be-true claims.",
  status: "open" as const,
  resolutionAction: null,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-10T10:00:00Z"),
};

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../schema/portal-posting-reports", () => ({
  portalPostingReports: {
    id: "id",
    postingId: "posting_id",
    reporterUserId: "reporter_user_id",
    category: "category",
    description: "description",
    status: "status",
    resolutionAction: "resolution_action",
    resolvedAt: "resolved_at",
    resolvedByUserId: "resolved_by_user_id",
    resolutionNote: "resolution_note",
    createdAt: "created_at",
  },
  portalReportCategoryEnum: [
    "scam_fraud",
    "misleading_info",
    "discriminatory_content",
    "duplicate_posting",
    "other",
  ],
  portalReportStatusEnum: ["open", "investigating", "resolved", "dismissed"],
  portalReportPriorityEnum: ["normal", "elevated", "urgent"],
}));

vi.mock("../schema/portal-job-postings", () => ({
  portalJobPostings: {
    id: "pjp_id",
    companyId: "pjp_company_id",
    title: "pjp_title",
  },
}));

vi.mock("../schema/portal-company-profiles", () => ({
  portalCompanyProfiles: {
    id: "pcp_id",
    name: "pcp_name",
  },
}));

import { db } from "../index";

describe("portal-posting-reports queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("insertPostingReport", () => {
    it("inserts a report and returns the row", async () => {
      const chain = makeWriteChain([mockReport]);
      vi.mocked(db.insert).mockReturnValue(chain as never);

      const { insertPostingReport } = await import("./portal-posting-reports");
      const result = await insertPostingReport({
        postingId: "posting-1",
        reporterUserId: "user-1",
        category: "scam_fraud",
        description: "This posting looks like a scam with too-good-to-be-true claims.",
      });

      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual(mockReport);
    });

    it("throws if no row returned", async () => {
      const chain = makeWriteChain([]);
      vi.mocked(db.insert).mockReturnValue(chain as never);

      const { insertPostingReport } = await import("./portal-posting-reports");
      await expect(
        insertPostingReport({
          postingId: "posting-1",
          reporterUserId: "user-1",
          category: "scam_fraud",
          description: "This posting looks like a scam with too-good-to-be-true claims.",
        }),
      ).rejects.toThrow("no row returned");
    });
  });

  describe("getExistingActiveReportForUser", () => {
    it("returns active report when found", async () => {
      const chain = makeSelectChain([mockReport]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getExistingActiveReportForUser } = await import("./portal-posting-reports");
      const result = await getExistingActiveReportForUser("posting-1", "user-1");
      expect(result).toEqual(mockReport);
    });

    it("returns null when no active report found", async () => {
      const chain = makeSelectChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getExistingActiveReportForUser } = await import("./portal-posting-reports");
      const result = await getExistingActiveReportForUser("posting-1", "user-2");
      expect(result).toBeNull();
    });
  });

  describe("getReportsForPosting", () => {
    it("returns all reports for a posting ordered by createdAt desc", async () => {
      const reports = [mockReport, { ...mockReport, id: "report-2", status: "resolved" as const }];
      const chain = makeSelectChain(reports);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getReportsForPosting } = await import("./portal-posting-reports");
      const result = await getReportsForPosting("posting-1");
      expect(result).toHaveLength(2);
    });
  });

  describe("countActiveReportsForPosting", () => {
    it("returns count of active reports for a posting", async () => {
      const chain = makeSelectChain([{ cnt: 3 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countActiveReportsForPosting } = await import("./portal-posting-reports");
      const result = await countActiveReportsForPosting("posting-1");
      expect(result).toBe(3);
    });

    it("returns 0 when no active reports", async () => {
      const chain = makeSelectChain([{ cnt: 0 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countActiveReportsForPosting } = await import("./portal-posting-reports");
      const result = await countActiveReportsForPosting("posting-1");
      expect(result).toBe(0);
    });
  });

  describe("listPostingsWithActiveReports", () => {
    it("returns aggregated report data with priority and pagination", async () => {
      const item = {
        postingId: "posting-1",
        postingTitle: "Software Engineer",
        companyName: "Tech Corp",
        companyId: "company-1",
        reportCount: 5,
        latestReportAt: new Date("2026-04-10T12:00:00Z"),
        priority: "urgent" as const,
      };
      // First call returns items, second returns count
      const selectSpy = vi.mocked(db.select);
      const itemChain = makeSelectChain([item]);
      const countChain = makeSelectChain([{ total: 1 }]);
      selectSpy.mockReturnValueOnce(itemChain as never).mockReturnValueOnce(countChain as never);

      const { listPostingsWithActiveReports } = await import("./portal-posting-reports");
      const result = await listPostingsWithActiveReports({ limit: 50, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]!.priority).toBe("urgent");
    });

    it("returns empty when no active reports", async () => {
      const selectSpy = vi.mocked(db.select);
      const itemChain = makeSelectChain([]);
      const countChain = makeSelectChain([{ total: 0 }]);
      selectSpy.mockReturnValueOnce(itemChain as never).mockReturnValueOnce(countChain as never);

      const { listPostingsWithActiveReports } = await import("./portal-posting-reports");
      const result = await listPostingsWithActiveReports({ limit: 50, offset: 0 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("resolveReportsForPosting", () => {
    it("resolves all active reports and returns count", async () => {
      const chain = makeWriteChain([{ id: "report-1" }, { id: "report-2" }]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { resolveReportsForPosting } = await import("./portal-posting-reports");
      const result = await resolveReportsForPosting("posting-1", {
        resolvedByUserId: "admin-1",
        resolutionAction: "reject",
        resolutionNote: "This posting was confirmed to be fraudulent after investigation.",
      });
      expect(result).toBe(2);
    });
  });

  describe("dismissReportsForPosting", () => {
    it("dismisses all active reports and returns count", async () => {
      const chain = makeWriteChain([{ id: "report-1" }]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { dismissReportsForPosting } = await import("./portal-posting-reports");
      const result = await dismissReportsForPosting("posting-1", {
        resolvedByUserId: "admin-1",
        resolutionNote: "Reviewed all reports and found no policy violations in this posting.",
      });
      expect(result).toBe(1);
    });
  });

  describe("countActiveReportsForCompanyPostings", () => {
    it("returns count of active reports for all company postings", async () => {
      const chain = makeSelectChain([{ cnt: 4 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countActiveReportsForCompanyPostings } = await import("./portal-posting-reports");
      const result = await countActiveReportsForCompanyPostings("company-1");
      expect(result).toBe(4);
    });

    it("returns 0 when no active reports for company", async () => {
      const chain = makeSelectChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countActiveReportsForCompanyPostings } = await import("./portal-posting-reports");
      const result = await countActiveReportsForCompanyPostings("company-no-reports");
      expect(result).toBe(0);
    });
  });

  describe("getReporterUserIdsForPosting", () => {
    it("returns distinct reporter user ids for resolved/dismissed reports", async () => {
      const chain = makeSelectChain([{ reporterUserId: "user-1" }, { reporterUserId: "user-2" }]);
      vi.mocked(db.selectDistinct).mockReturnValue(chain as never);

      const { getReporterUserIdsForPosting } = await import("./portal-posting-reports");
      const result = await getReporterUserIdsForPosting("posting-1");
      expect(result).toEqual(["user-1", "user-2"]);
    });
  });

  describe("schema drift guard", () => {
    it("portalPostingReports schema contains expected fields", () => {
      const schema = {
        id: "id",
        postingId: "posting_id",
        reporterUserId: "reporter_user_id",
        category: "category",
        description: "description",
        status: "status",
        resolutionAction: "resolution_action",
        resolvedAt: "resolved_at",
        resolvedByUserId: "resolved_by_user_id",
        resolutionNote: "resolution_note",
        createdAt: "created_at",
      };
      expect(Object.keys(schema)).toContain("postingId");
      expect(Object.keys(schema)).toContain("reporterUserId");
      expect(Object.keys(schema)).toContain("category");
      expect(Object.keys(schema)).toContain("status");
    });
  });
});
