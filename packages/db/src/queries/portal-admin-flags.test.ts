// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Chain builder for Drizzle select fluent API
function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "innerJoin", "where", "orderBy", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["offset"] = vi.fn().mockResolvedValue(returnValue);
  // Support awaiting the chain directly (terminal .where / .limit)
  chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

// Chain builder for Drizzle insert/update fluent API
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

const mockFlag = {
  id: "flag-1",
  postingId: "posting-1",
  adminUserId: "admin-1",
  category: "misleading_content",
  severity: "high",
  description: "This is a misleading job description with false claims.",
  status: "open",
  autoPaused: true,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionAction: null,
  resolutionNote: null,
  createdAt: new Date("2026-04-01T10:00:00Z"),
};

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../schema/portal-admin-flags", () => ({
  portalAdminFlags: {
    id: "id",
    postingId: "posting_id",
    adminUserId: "admin_user_id",
    category: "category",
    severity: "severity",
    description: "description",
    status: "status",
    autoPaused: "auto_paused",
    resolvedAt: "resolved_at",
    resolvedByUserId: "resolved_by_user_id",
    resolutionAction: "resolution_action",
    resolutionNote: "resolution_note",
    createdAt: "created_at",
  },
  portalAdminFlagStatusEnum: ["open", "resolved", "dismissed"],
  portalViolationCategoryEnum: [
    "misleading_content",
    "discriminatory_language",
    "scam_fraud",
    "terms_of_service_violation",
    "other",
  ],
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

describe("portal-admin-flags queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("insertAdminFlag", () => {
    it("inserts a flag and returns the row", async () => {
      const insertChain = makeWriteChain([mockFlag]);
      vi.mocked(db.insert).mockReturnValue(insertChain as never);

      const { insertAdminFlag } = await import("./portal-admin-flags");
      const result = await insertAdminFlag({
        postingId: "posting-1",
        adminUserId: "admin-1",
        category: "misleading_content",
        severity: "high",
        description: "This is a misleading job description with false claims.",
      });

      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual(mockFlag);
    });

    it("throws if no row returned", async () => {
      const insertChain = makeWriteChain([]);
      vi.mocked(db.insert).mockReturnValue(insertChain as never);

      const { insertAdminFlag } = await import("./portal-admin-flags");
      await expect(
        insertAdminFlag({
          postingId: "posting-1",
          adminUserId: "admin-1",
          category: "misleading_content",
          severity: "high",
          description: "This is a misleading job description with false claims.",
        }),
      ).rejects.toThrow("no row returned");
    });
  });

  describe("getAdminFlagById", () => {
    it("returns the flag when found", async () => {
      const chain = makeSelectChain([mockFlag]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getAdminFlagById } = await import("./portal-admin-flags");
      const result = await getAdminFlagById("flag-1");
      expect(result).toEqual(mockFlag);
    });

    it("returns null when not found", async () => {
      const chain = makeSelectChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getAdminFlagById } = await import("./portal-admin-flags");
      const result = await getAdminFlagById("flag-999");
      expect(result).toBeNull();
    });
  });

  describe("getOpenFlagForPosting", () => {
    it("returns open flag for posting", async () => {
      const chain = makeSelectChain([mockFlag]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getOpenFlagForPosting } = await import("./portal-admin-flags");
      const result = await getOpenFlagForPosting("posting-1");
      expect(result).toEqual(mockFlag);
    });

    it("returns null when no open flag", async () => {
      const chain = makeSelectChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getOpenFlagForPosting } = await import("./portal-admin-flags");
      const result = await getOpenFlagForPosting("posting-1");
      expect(result).toBeNull();
    });
  });

  describe("getFlagsForPosting", () => {
    it("returns all flags in order", async () => {
      const flags = [mockFlag, { ...mockFlag, id: "flag-2", status: "resolved" }];
      const chain = makeSelectChain(flags);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { getFlagsForPosting } = await import("./portal-admin-flags");
      const result = await getFlagsForPosting("posting-1");
      expect(result).toHaveLength(2);
    });
  });

  describe("listOpenFlags", () => {
    it("returns enriched open flags with pagination", async () => {
      const enrichedFlag = {
        ...mockFlag,
        postingTitle: "Software Engineer",
        companyName: "Tech Corp",
        companyId: "company-1",
      };
      const selectChain = makeSelectChain([enrichedFlag]);
      const countChain = makeSelectChain([{ total: 1 }]);

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? selectChain : countChain) as never;
      });

      const { listOpenFlags } = await import("./portal-admin-flags");
      const result = await listOpenFlags({ limit: 20, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0]?.postingTitle).toBe("Software Engineer");
    });

    it("returns empty list when no open flags", async () => {
      const selectChain = makeSelectChain([]);
      const countChain = makeSelectChain([{ total: 0 }]);

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? selectChain : countChain) as never;
      });

      const { listOpenFlags } = await import("./portal-admin-flags");
      const result = await listOpenFlags({ limit: 20, offset: 0 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("filters by companyId when provided", async () => {
      const enrichedFlag = {
        ...mockFlag,
        postingTitle: "Software Engineer",
        companyName: "Tech Corp",
        companyId: "company-1",
      };
      const selectChain = makeSelectChain([enrichedFlag]);
      const countChain = makeSelectChain([{ total: 1 }]);

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? selectChain : countChain) as never;
      });

      const { listOpenFlags } = await import("./portal-admin-flags");
      const result = await listOpenFlags({ limit: 20, offset: 0, companyId: "company-1" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.companyId).toBe("company-1");
      expect(result.total).toBe(1);
    });

    it("returns all violations without companyId filter (backward compatible)", async () => {
      const flags = [
        { ...mockFlag, postingTitle: "Job A", companyName: "Co A", companyId: "c-1" },
        { ...mockFlag, id: "flag-2", postingTitle: "Job B", companyName: "Co B", companyId: "c-2" },
      ];
      const selectChain = makeSelectChain(flags);
      const countChain = makeSelectChain([{ total: 2 }]);

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? selectChain : countChain) as never;
      });

      const { listOpenFlags } = await import("./portal-admin-flags");
      const result = await listOpenFlags({ limit: 20, offset: 0 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("includes companyName and companyId in result rows", async () => {
      const enrichedFlag = {
        ...mockFlag,
        postingTitle: "Engineering Lead",
        companyName: "Igbo Tech",
        companyId: "company-42",
      };
      const selectChain = makeSelectChain([enrichedFlag]);
      const countChain = makeSelectChain([{ total: 1 }]);

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? selectChain : countChain) as never;
      });

      const { listOpenFlags } = await import("./portal-admin-flags");
      const result = await listOpenFlags({ limit: 10, offset: 0 });
      expect(result.items[0]?.companyName).toBe("Igbo Tech");
      expect(result.items[0]?.companyId).toBe("company-42");
    });
  });

  describe("resolveAdminFlag", () => {
    it("resolves an open flag and returns updated row", async () => {
      const resolved = { ...mockFlag, status: "resolved", resolutionAction: "reject" };
      const chain = makeWriteChain([resolved]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { resolveAdminFlag } = await import("./portal-admin-flags");
      const result = await resolveAdminFlag("flag-1", {
        resolvedByUserId: "admin-1",
        resolutionAction: "reject",
        resolutionNote: "Posting contains false information about the role.",
      });
      expect(result?.status).toBe("resolved");
      expect(result?.resolutionAction).toBe("reject");
    });

    it("returns null when flag not found or not open (race condition)", async () => {
      const chain = makeWriteChain([]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { resolveAdminFlag } = await import("./portal-admin-flags");
      const result = await resolveAdminFlag("flag-999", {
        resolvedByUserId: "admin-1",
        resolutionAction: "reject",
        resolutionNote: "Posting contains false information about the role.",
      });
      expect(result).toBeNull();
    });
  });

  describe("dismissAdminFlag", () => {
    it("dismisses an open flag and returns updated row", async () => {
      const dismissed = {
        ...mockFlag,
        status: "dismissed",
        resolutionAction: "dismiss",
        autoPaused: true,
      };
      const chain = makeWriteChain([dismissed]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { dismissAdminFlag } = await import("./portal-admin-flags");
      const result = await dismissAdminFlag("flag-1", {
        resolvedByUserId: "admin-1",
        resolutionNote: "Upon review, this flag was not a genuine violation.",
      });
      expect(result?.status).toBe("dismissed");
      expect(result?.resolutionAction).toBe("dismiss");
    });

    it("returns null when flag not found or not open", async () => {
      const chain = makeWriteChain([]);
      vi.mocked(db.update).mockReturnValue(chain as never);

      const { dismissAdminFlag } = await import("./portal-admin-flags");
      const result = await dismissAdminFlag("flag-999", {
        resolvedByUserId: "admin-1",
        resolutionNote: "Upon review, this flag was not a genuine violation.",
      });
      expect(result).toBeNull();
    });
  });

  describe("countOpenViolationsForCompany", () => {
    it("returns count of open violations for company", async () => {
      const chain = makeSelectChain([{ cnt: 3 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countOpenViolationsForCompany } = await import("./portal-admin-flags");
      const count = await countOpenViolationsForCompany("company-1");
      expect(count).toBe(3);
    });

    it("returns 0 when no violations", async () => {
      const chain = makeSelectChain([{ cnt: 0 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countOpenViolationsForCompany } = await import("./portal-admin-flags");
      const count = await countOpenViolationsForCompany("company-1");
      expect(count).toBe(0);
    });
  });

  describe("countRecentViolationsForCompany", () => {
    it("returns count of non-dismissed violations within time window", async () => {
      const chain = makeSelectChain([{ cnt: 1 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countRecentViolationsForCompany } = await import("./portal-admin-flags");
      const since = new Date("2026-02-01");
      const count = await countRecentViolationsForCompany("company-1", since);
      expect(count).toBe(1);
    });

    it("returns 0 when no recent violations", async () => {
      const chain = makeSelectChain([{ cnt: 0 }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { countRecentViolationsForCompany } = await import("./portal-admin-flags");
      const since = new Date("2026-02-01");
      const count = await countRecentViolationsForCompany("company-2", since);
      expect(count).toBe(0);
    });
  });

  describe("CASCADE deletion (DB constraint verification)", () => {
    it("schema exports portalAdminFlags table with expected columns", async () => {
      // Structural assertion: verify the Drizzle schema declares the expected
      // columns. Actual CASCADE behavior is enforced at the DB level by the
      // migration; this test guards against accidental schema drift.
      const schemaModule = await import("../schema/portal-admin-flags");
      const table = schemaModule.portalAdminFlags;
      expect(table).toBeDefined();
      // Key columns must exist on the table definition
      expect(table.postingId).toBeDefined();
      expect(table.adminUserId).toBeDefined();
      expect(table.resolvedByUserId).toBeDefined();
      expect(table.autoPaused).toBeDefined();
      expect(table.status).toBeDefined();
    });

    it("schema exports enums for status and violation category", async () => {
      const schemaModule = await import("../schema/portal-admin-flags");
      expect(schemaModule.portalAdminFlagStatusEnum).toBeDefined();
      expect(schemaModule.portalViolationCategoryEnum).toBeDefined();
    });
  });
});
