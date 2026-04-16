// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "innerJoin", "where", "orderBy", "limit", "groupBy"];
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

const mockVerification = {
  id: "ver-1",
  companyId: "company-1",
  submittedDocuments: [
    {
      fileUploadId: "fu-1",
      objectKey: "portal/verification/user-1/doc.pdf",
      originalFilename: "business-reg.pdf",
    },
  ],
  status: "pending" as const,
  adminNotes: null,
  submittedAt: new Date("2026-04-10T10:00:00Z"),
  reviewedAt: null,
  reviewedByAdminId: null,
  createdAt: new Date("2026-04-10T10:00:00Z"),
};

vi.mock("../index", () => ({ db: mockDb }));

vi.mock("../schema/portal-employer-verifications", () => ({
  portalEmployerVerifications: {
    id: "id",
    companyId: "company_id",
    submittedDocuments: "submitted_documents",
    status: "status",
    adminNotes: "admin_notes",
    submittedAt: "submitted_at",
    reviewedAt: "reviewed_at",
    reviewedByAdminId: "reviewed_by_admin_id",
    createdAt: "created_at",
  },
  portalVerificationStatusEnum: ["pending", "approved", "rejected"],
}));

vi.mock("../schema/portal-company-profiles", () => ({
  portalCompanyProfiles: {
    id: "id",
    name: "name",
    ownerUserId: "owner_user_id",
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: { id: "id", name: "name" },
}));

import {
  insertVerificationRequest,
  getPendingVerificationForCompany,
  getVerificationById,
  getVerificationHistoryForCompany,
  getLatestVerificationForCompany,
  listPendingVerifications,
  approveVerification,
  rejectVerification,
} from "./portal-employer-verifications";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("insertVerificationRequest", () => {
  it("inserts and returns the verification", async () => {
    const chain = makeWriteChain([mockVerification]);
    mockDb.insert.mockReturnValue(chain);
    const result = await insertVerificationRequest({
      companyId: "company-1",
      submittedDocuments: mockVerification.submittedDocuments,
    });
    expect(result).toEqual(mockVerification);
  });

  it("throws if no row returned", async () => {
    const chain = makeWriteChain([]);
    mockDb.insert.mockReturnValue(chain);
    await expect(
      insertVerificationRequest({ companyId: "company-1", submittedDocuments: [] }),
    ).rejects.toThrow("no row returned");
  });
});

describe("getPendingVerificationForCompany", () => {
  it("returns pending verification when found", async () => {
    const chain = makeSelectChain([mockVerification]);
    mockDb.select.mockReturnValue(chain);
    const result = await getPendingVerificationForCompany("company-1");
    expect(result).toEqual(mockVerification);
  });

  it("returns null when not found", async () => {
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getPendingVerificationForCompany("company-1");
    expect(result).toBeNull();
  });
});

describe("getVerificationById", () => {
  it("returns verification when found", async () => {
    const chain = makeSelectChain([mockVerification]);
    mockDb.select.mockReturnValue(chain);
    const result = await getVerificationById("ver-1");
    expect(result).toEqual(mockVerification);
  });

  it("returns null when not found", async () => {
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getVerificationById("ver-not-found");
    expect(result).toBeNull();
  });
});

describe("getVerificationHistoryForCompany", () => {
  it("returns all verifications ordered by created_at desc", async () => {
    const chain = makeSelectChain([mockVerification, { ...mockVerification, id: "ver-2" }]);
    mockDb.select.mockReturnValue(chain);
    const result = await getVerificationHistoryForCompany("company-1");
    expect(result).toHaveLength(2);
  });
});

describe("getLatestVerificationForCompany", () => {
  it("returns the most recent verification", async () => {
    const chain = makeSelectChain([mockVerification]);
    mockDb.select.mockReturnValue(chain);
    const result = await getLatestVerificationForCompany("company-1");
    expect(result).toEqual(mockVerification);
  });

  it("returns null when company has no verifications", async () => {
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getLatestVerificationForCompany("company-x");
    expect(result).toBeNull();
  });
});

describe("listPendingVerifications", () => {
  it("returns items and total for pending verifications", async () => {
    const queueItem = {
      id: "ver-1",
      companyId: "company-1",
      companyName: "Acme Corp",
      ownerUserName: "Jane",
      ownerUserId: "user-1",
      documentCount: 2,
      submittedAt: new Date("2026-04-10T10:00:00Z"),
      status: "pending",
    };
    const chain = makeSelectChain([queueItem]);
    const countChain = makeSelectChain([{ total: 1 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);
    const result = await listPendingVerifications({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("returns empty items and zero total when no pending", async () => {
    const chain = makeSelectChain([]);
    const countChain = makeSelectChain([{ total: 0 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);
    const result = await listPendingVerifications({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("approveVerification", () => {
  it("updates status to approved and returns updated record", async () => {
    const approved = {
      ...mockVerification,
      status: "approved" as const,
      reviewedAt: new Date(),
      reviewedByAdminId: "admin-1",
    };
    const chain = makeWriteChain([approved]);
    mockDb.update.mockReturnValue(chain);
    const result = await approveVerification("ver-1", "admin-1");
    expect(result?.status).toBe("approved");
  });

  it("returns null if record was not pending (race guard)", async () => {
    const chain = makeWriteChain([]);
    mockDb.update.mockReturnValue(chain);
    const result = await approveVerification("ver-1", "admin-1");
    expect(result).toBeNull();
  });
});

describe("rejectVerification", () => {
  it("updates status to rejected with admin notes", async () => {
    const rejected = {
      ...mockVerification,
      status: "rejected" as const,
      adminNotes: "Insufficient documentation provided.",
      reviewedAt: new Date(),
      reviewedByAdminId: "admin-1",
    };
    const chain = makeWriteChain([rejected]);
    mockDb.update.mockReturnValue(chain);
    const result = await rejectVerification(
      "ver-1",
      "admin-1",
      "Insufficient documentation provided.",
    );
    expect(result?.status).toBe("rejected");
    expect(result?.adminNotes).toBe("Insufficient documentation provided.");
  });

  it("returns null if record was not pending (race guard)", async () => {
    const chain = makeWriteChain([]);
    mockDb.update.mockReturnValue(chain);
    const result = await rejectVerification(
      "ver-1",
      "admin-1",
      "Insufficient documentation provided.",
    );
    expect(result).toBeNull();
  });
});
