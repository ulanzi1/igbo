// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-employer-verifications", () => ({
  insertVerificationRequest: vi.fn(),
  getPendingVerificationForCompany: vi.fn(),
  getVerificationById: vi.fn(),
  getLatestVerificationForCompany: vi.fn(),
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
}));

vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: vi.fn(),
  updateCompanyProfile: vi.fn(),
}));

vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@igbo/db", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@igbo/db/schema/portal-employer-verifications", () => ({
  portalEmployerVerifications: {
    id: "id",
    companyId: "company_id",
    status: "status",
    reviewedAt: "reviewed_at",
    reviewedByAdminId: "reviewed_by_admin_id",
  },
}));

vi.mock("@igbo/db/schema/portal-company-profiles", () => ({
  portalCompanyProfiles: { id: "id", trustBadge: "trust_badge", updatedAt: "updated_at" },
}));

vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: {
    actorId: "actor_id",
    action: "action",
    targetType: "target_type",
    details: "details",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

vi.mock("@/lib/portal-errors", () => ({
  PORTAL_ERRORS: {
    ROLE_MISMATCH: "PORTAL_ERRORS.ROLE_MISMATCH",
    NOT_FOUND: "PORTAL_ERRORS.NOT_FOUND",
    COMPANY_REQUIRED: "PORTAL_ERRORS.COMPANY_REQUIRED",
    INVALID_STATUS_TRANSITION: "PORTAL_ERRORS.INVALID_STATUS_TRANSITION",
    VERIFICATION_ALREADY_PENDING: "PORTAL_ERRORS.VERIFICATION_ALREADY_PENDING",
    VERIFICATION_NOT_FOUND: "PORTAL_ERRORS.VERIFICATION_NOT_FOUND",
  },
}));

import {
  insertVerificationRequest,
  getPendingVerificationForCompany,
  getVerificationById,
  getLatestVerificationForCompany,
  rejectVerification as rejectVerificationQuery,
} from "@igbo/db/queries/portal-employer-verifications";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { createNotification } from "@igbo/db/queries/notifications";
import { db } from "@igbo/db";
import { portalEventBus } from "@/services/event-bus";
import {
  submitVerificationRequest,
  approveVerificationRequest,
  rejectVerificationRequest,
  getVerificationStatus,
} from "./employer-verification-service";
import { installMockTransaction } from "@/test/mock-transaction";
import { companyProfileFactory, employerVerificationFactory } from "@/test/factories";

const mockCompany = companyProfileFactory({
  id: "company-1",
  ownerUserId: "employer-1",
  name: "Acme Corp",
});

const mockVerification = employerVerificationFactory({
  id: "ver-1",
  companyId: "company-1",
  submittedDocuments: [
    {
      fileUploadId: "fu-1",
      objectKey: "portal/verification/user-1/doc.pdf",
      originalFilename: "reg.pdf",
    },
  ],
});

const mockInsertChain = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.insert).mockReturnValue(mockInsertChain as never);
  mockInsertChain.insert.mockReturnValue(mockInsertChain);
  mockInsertChain.values.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// submitVerificationRequest
// ---------------------------------------------------------------------------

describe("submitVerificationRequest", () => {
  it("creates a verification record and emits event", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getPendingVerificationForCompany).mockResolvedValue(null);
    vi.mocked(insertVerificationRequest).mockResolvedValue(mockVerification);

    const result = await submitVerificationRequest(
      "company-1",
      "employer-1",
      mockVerification.submittedDocuments,
    );

    expect(result).toEqual(mockVerification);
    expect(insertVerificationRequest).toHaveBeenCalledWith({
      companyId: "company-1",
      submittedDocuments: mockVerification.submittedDocuments,
    });
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "employer.verification_submitted",
      expect.objectContaining({ companyId: "company-1", employerUserId: "employer-1" }),
    );
  });

  it("throws 400 when no documents provided", async () => {
    await expect(submitVerificationRequest("company-1", "employer-1", [])).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when more than 3 documents provided", async () => {
    const docs = Array.from({ length: 4 }, (_, i) => ({
      fileUploadId: `fu-${i}`,
      objectKey: `key-${i}`,
      originalFilename: `doc-${i}.pdf`,
    }));
    await expect(submitVerificationRequest("company-1", "employer-1", docs)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 409 COMPANY_REQUIRED when company not found", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(null);
    await expect(
      submitVerificationRequest("company-x", "employer-1", mockVerification.submittedDocuments),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 403 when employer does not own company", async () => {
    vi.mocked(getCompanyById).mockResolvedValue({
      ...mockCompany,
      ownerUserId: "other-employer",
    } as never);
    await expect(
      submitVerificationRequest("company-1", "employer-1", mockVerification.submittedDocuments),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 409 VERIFICATION_ALREADY_PENDING when pending exists (layer 1 dedup)", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getPendingVerificationForCompany).mockResolvedValue(mockVerification);
    await expect(
      submitVerificationRequest("company-1", "employer-1", mockVerification.submittedDocuments),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 VERIFICATION_ALREADY_PENDING on DB unique violation (layer 2 dedup)", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getPendingVerificationForCompany).mockResolvedValue(null);
    vi.mocked(insertVerificationRequest).mockRejectedValue({ code: "23505" });
    await expect(
      submitVerificationRequest("company-1", "employer-1", mockVerification.submittedDocuments),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rethrows non-unique DB errors", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getPendingVerificationForCompany).mockResolvedValue(null);
    vi.mocked(insertVerificationRequest).mockRejectedValue(new Error("DB connection failed"));
    await expect(
      submitVerificationRequest("company-1", "employer-1", mockVerification.submittedDocuments),
    ).rejects.toThrow("DB connection failed");
  });
});

// ---------------------------------------------------------------------------
// approveVerificationRequest
// ---------------------------------------------------------------------------

describe("approveVerificationRequest", () => {
  it("approves verification, sets trustBadge=true, sends notification, emits event", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification);
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    installMockTransaction({ updateReturning: [{ id: "ver-1" }] });
    vi.mocked(createNotification).mockResolvedValue(undefined as never);

    await approveVerificationRequest("ver-1", "admin-1");

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "employer-1" }),
    );
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "employer.verification_approved",
      expect.objectContaining({ verificationId: "ver-1", approvedByAdminId: "admin-1" }),
    );
  });

  it("throws 404 if verification not found", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(null);
    await expect(approveVerificationRequest("ver-x", "admin-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 if verification is not pending", async () => {
    vi.mocked(getVerificationById).mockResolvedValue({
      ...mockVerification,
      status: "approved" as const,
    });
    await expect(approveVerificationRequest("ver-1", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 409 on race condition (tx returns no row)", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification);
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    installMockTransaction({ updateReturning: [] });
    await expect(approveVerificationRequest("ver-1", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// rejectVerificationRequest
// ---------------------------------------------------------------------------

describe("rejectVerificationRequest", () => {
  const validReason =
    "Insufficient documentation provided; please resubmit with official registration.";

  it("rejects verification, sends notification, emits event", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification);
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(rejectVerificationQuery).mockResolvedValue({
      ...mockVerification,
      status: "rejected" as const,
      adminNotes: validReason,
    });
    vi.mocked(createNotification).mockResolvedValue(undefined as never);

    await rejectVerificationRequest("ver-1", "admin-1", validReason);

    expect(rejectVerificationQuery).toHaveBeenCalledWith("ver-1", "admin-1", validReason);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "employer-1" }),
    );
    expect(portalEventBus.emit).toHaveBeenCalledWith(
      "employer.verification_rejected",
      expect.objectContaining({
        verificationId: "ver-1",
        rejectedByAdminId: "admin-1",
        reason: validReason,
      }),
    );
  });

  it("throws 400 if reason is too short", async () => {
    await expect(rejectVerificationRequest("ver-1", "admin-1", "Too short")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 404 if verification not found", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(null);
    await expect(rejectVerificationRequest("ver-x", "admin-1", validReason)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 if verification is not pending", async () => {
    vi.mocked(getVerificationById).mockResolvedValue({
      ...mockVerification,
      status: "rejected" as const,
    });
    await expect(rejectVerificationRequest("ver-1", "admin-1", validReason)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 409 on race condition (db returns null)", async () => {
    vi.mocked(getVerificationById).mockResolvedValue(mockVerification);
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(rejectVerificationQuery).mockResolvedValue(null);
    await expect(rejectVerificationRequest("ver-1", "admin-1", validReason)).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ---------------------------------------------------------------------------
// getVerificationStatus
// ---------------------------------------------------------------------------

describe("getVerificationStatus", () => {
  it("returns 'verified' when trustBadge=true", async () => {
    vi.mocked(getCompanyById).mockResolvedValue({ ...mockCompany, trustBadge: true } as never);
    vi.mocked(getLatestVerificationForCompany).mockResolvedValue(mockVerification);
    const result = await getVerificationStatus("company-1");
    expect(result.status).toBe("verified");
  });

  it("returns 'pending' when latest verification is pending", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getLatestVerificationForCompany).mockResolvedValue(mockVerification);
    const result = await getVerificationStatus("company-1");
    expect(result.status).toBe("pending");
    expect(result.latestVerification).toEqual(mockVerification);
  });

  it("returns 'rejected' when latest verification is rejected", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getLatestVerificationForCompany).mockResolvedValue({
      ...mockVerification,
      status: "rejected" as const,
    });
    const result = await getVerificationStatus("company-1");
    expect(result.status).toBe("rejected");
  });

  it("returns 'unverified' when no verification records exist", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(mockCompany as never);
    vi.mocked(getLatestVerificationForCompany).mockResolvedValue(null);
    const result = await getVerificationStatus("company-1");
    expect(result.status).toBe("unverified");
    expect(result.latestVerification).toBeNull();
  });

  it("returns 'unverified' when company not found", async () => {
    vi.mocked(getCompanyById).mockResolvedValue(null);
    const result = await getVerificationStatus("company-x");
    expect(result.status).toBe("unverified");
  });
});
