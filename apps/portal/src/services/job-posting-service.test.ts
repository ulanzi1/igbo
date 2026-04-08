// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
  countActivePostingsByCompanyId: vi.fn(),
  updateJobPostingStatus: vi.fn(),
  updateJobPosting: vi.fn(),
}));
vi.mock("@igbo/db/schema/portal-job-postings", () => ({
  portalJobPostings: { id: "id_col", updatedAt: "updated_at_col", status: "status_col" },
}));
vi.mock("@igbo/db", () => ({
  db: {
    update: vi.fn(),
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
}));

// Mock the approval-integrity guard so JOB_ADMIN approve tests don't reach
// the real DB. Individual tests can override the mock to assert that the
// guard fires on non-canonical paths.
vi.mock("@/lib/approval-integrity", () => ({
  assertApprovalIntegrity: vi.fn().mockResolvedValue(undefined),
}));

// Mock fast-lane eligibility + approvePosting — submitForReview wires these in.
// Default: ineligible so submitForReview stays pending_review (no auto-approve).
vi.mock("@/services/admin-review-service", () => ({
  checkFastLaneEligibility: vi
    .fn()
    .mockResolvedValue({ eligible: false, reasons: ["test default"] }),
  approvePosting: vi.fn().mockResolvedValue(undefined),
}));

// Mock screening pipeline — default: pass (no flags)
vi.mock("@/services/screening", () => ({
  runScreening: vi.fn().mockResolvedValue({
    status: "pass",
    flags: [],
    checked_at: "2026-04-01T10:00:00Z",
    rule_version: 5,
  }),
}));

import { db } from "@igbo/db";
import {
  getJobPostingById,
  countActivePostingsByCompanyId,
  updateJobPostingStatus,
  updateJobPosting,
} from "@igbo/db/queries/portal-job-postings";
import { assertApprovalIntegrity } from "@/lib/approval-integrity";
import { checkFastLaneEligibility, approvePosting } from "@/services/admin-review-service";
import { runScreening } from "@/services/screening";
import {
  canEditPosting,
  transitionStatus,
  closePosting,
  submitForReview,
  editActivePosting,
  renewPosting,
} from "./job-posting-service";

const BASE_POSTING = {
  id: "posting-1",
  companyId: "company-1",
  title: "Software Engineer",
  descriptionHtml: "<p>Great role</p>",
  requirements: "<p>5 years exp</p>",
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "draft" as const,
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJobPostingById).mockResolvedValue(BASE_POSTING as never);
  vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(0);
  vi.mocked(updateJobPostingStatus).mockResolvedValue(BASE_POSTING as never);
  vi.mocked(updateJobPosting).mockResolvedValue(BASE_POSTING as never);
});

describe("canEditPosting", () => {
  it("returns true for draft", () => expect(canEditPosting("draft")).toBe(true));
  it("returns true for active", () => expect(canEditPosting("active")).toBe(true));
  it("returns true for paused", () => expect(canEditPosting("paused")).toBe(true));
  it("returns true for rejected", () => expect(canEditPosting("rejected")).toBe(true));
  it("returns false for pending_review", () =>
    expect(canEditPosting("pending_review")).toBe(false));
  it("returns false for filled", () => expect(canEditPosting("filled")).toBe(false));
  it("returns true for expired (Edit & Renew path — P-1.5)", () =>
    expect(canEditPosting("expired")).toBe(true));
});

describe("transitionStatus", () => {
  it("transitions draft → pending_review successfully", async () => {
    await expect(
      transitionStatus("posting-1", "pending_review", "company-1", "EMPLOYER"),
    ).resolves.toBeUndefined();
    expect(updateJobPostingStatus).toHaveBeenCalledWith("posting-1", "pending_review");
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(
      transitionStatus("unknown", "pending_review", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when companyId does not match (ownership check)", async () => {
    await expect(
      transitionStatus("posting-1", "pending_review", "different-company", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 409 for invalid transition (draft → active)", async () => {
    await expect(
      transitionStatus("posting-1", "active", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 for invalid transition (filled → draft — terminal)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "filled" } as never);
    await expect(
      transitionStatus("posting-1", "draft", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 403 when employer tries to approve (pending_review → active) — Approval Integrity Rule", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await expect(
      transitionStatus("posting-1", "active", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows JOB_ADMIN to approve (pending_review → active)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(0);
    await expect(
      transitionStatus("posting-1", "active", "company-1", "JOB_ADMIN"),
    ).resolves.toBeUndefined();

    // AC-6: integrity guard MUST run for pending_review → active.
    expect(assertApprovalIntegrity).toHaveBeenCalledWith("posting-1");
  });

  it("propagates approval-integrity violations as 403 (AC-6)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(0);
    vi.mocked(assertApprovalIntegrity).mockRejectedValueOnce(
      Object.assign(new Error("integrity"), { status: 403 }),
    );

    await expect(
      transitionStatus("posting-1", "active", "company-1", "JOB_ADMIN"),
    ).rejects.toMatchObject({ status: 403 });

    // updateJobPostingStatus must NOT run when the guard rejects.
    expect(updateJobPostingStatus).not.toHaveBeenCalled();
  });

  it("does NOT call approval-integrity guard for non-active transitions", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await transitionStatus("posting-1", "draft", "company-1", "JOB_ADMIN");
    expect(assertApprovalIntegrity).not.toHaveBeenCalled();
  });

  it("throws 403 when employer tries to reject (pending_review → rejected) — Approval Integrity Rule", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await expect(
      transitionStatus("posting-1", "rejected", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when employer tries pending_review → draft — ADMIN_ONLY transition", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await expect(
      transitionStatus("posting-1", "draft", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows JOB_ADMIN to transition pending_review → draft (request changes path)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await expect(
      transitionStatus("posting-1", "draft", "company-1", "JOB_ADMIN"),
    ).resolves.toBeUndefined();
  });

  it("throws 409 for active posting limit when unpausing (paused → active)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "paused" } as never);
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(5);
    await expect(
      transitionStatus("posting-1", "active", "company-1", "EMPLOYER"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows unpause when under active limit", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "paused" } as never);
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(4);
    await expect(
      transitionStatus("posting-1", "active", "company-1", "EMPLOYER"),
    ).resolves.toBeUndefined();
  });

  it("throws 409 optimistic lock mismatch when expectedUpdatedAt does not match", async () => {
    await expect(
      transitionStatus("posting-1", "pending_review", "company-1", "EMPLOYER", {
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z", // different from posting's updatedAt
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("succeeds with correct expectedUpdatedAt", async () => {
    await expect(
      transitionStatus("posting-1", "pending_review", "company-1", "EMPLOYER", {
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("closePosting", () => {
  it("closes an active posting with outcome", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await expect(
      closePosting("posting-1", "filled_via_portal", "company-1"),
    ).resolves.toBeUndefined();
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ status: "filled", closedOutcome: "filled_via_portal" }),
    );
  });

  it("closes a paused posting with outcome", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "paused" } as never);
    await expect(
      closePosting("posting-1", "filled_internally", "company-1"),
    ).resolves.toBeUndefined();
  });

  it("records closedAt timestamp", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await closePosting("posting-1", "cancelled", "company-1");
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ closedAt: expect.any(Date) }),
    );
  });

  it("closes an expired posting with outcome (AC5 — P-1.5)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "expired" } as never);
    await expect(
      closePosting("posting-1", "filled_via_portal", "company-1"),
    ).resolves.toBeUndefined();
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ status: "filled", closedOutcome: "filled_via_portal" }),
    );
  });

  it("throws 409 when posting is not active, paused, or expired (draft cannot be closed)", async () => {
    await expect(closePosting("posting-1", "cancelled", "company-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(closePosting("unknown", "cancelled", "company-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 403 when ownership mismatch", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await expect(closePosting("posting-1", "cancelled", "wrong-company")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("submitForReview", () => {
  let capturedSet: Record<string, unknown> | null = null;

  beforeEach(() => {
    capturedSet = null;
    const returning = vi.fn().mockResolvedValue([{ id: "posting-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((payload: Record<string, unknown>) => {
      capturedSet = payload;
      return { where };
    });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
  });

  it("submits a complete draft for review — runs screening pipeline", async () => {
    await expect(submitForReview("posting-1", "company-1")).resolves.toBeUndefined();
    expect(runScreening).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Software Engineer" }),
    );
  });

  it("persists screening status, result JSON, and checked_at via race-safe .returning() update", async () => {
    await submitForReview("posting-1", "company-1");
    expect(db.update).toHaveBeenCalled();
    expect(capturedSet).toMatchObject({
      status: "pending_review",
      screeningStatus: "pass",
      screeningResultJson: expect.objectContaining({
        status: "pass",
        flags: [],
        rule_version: 5,
      }),
      screeningCheckedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("throws 409 when race is lost (row already transitioned — .returning() empty)", async () => {
    const returning = vi.fn().mockResolvedValue([]); // empty = another request already updated
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    await expect(submitForReview("posting-1", "company-1")).rejects.toMatchObject({
      status: 409,
    });
    // Fast-lane must NOT run when race was lost
    expect(checkFastLaneEligibility).not.toHaveBeenCalled();
    expect(approvePosting).not.toHaveBeenCalled();
  });

  it("throws 422 when required fields missing (no description)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      descriptionHtml: null,
    } as never);
    await expect(submitForReview("posting-1", "company-1")).rejects.toMatchObject({ status: 422 });
  });

  it("throws 422 when required fields missing (no location)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      location: null,
    } as never);
    await expect(submitForReview("posting-1", "company-1")).rejects.toMatchObject({ status: 422 });
  });

  it("submits a rejected posting for re-review", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "rejected",
      adminFeedbackComment: "Please fix the description",
    } as never);
    await expect(submitForReview("posting-1", "company-1")).resolves.toBeUndefined();
    // screening pipeline runs
    expect(runScreening).toHaveBeenCalled();
  });

  it("AC-7: consults checkFastLaneEligibility after screening persisted", async () => {
    await submitForReview("posting-1", "company-1");
    expect(checkFastLaneEligibility).toHaveBeenCalledWith("posting-1");
  });

  it("AC-7: fast-lane eligible → calls approvePosting with SYSTEM_USER_ID", async () => {
    vi.mocked(checkFastLaneEligibility).mockResolvedValueOnce({ eligible: true, reasons: [] });

    await expect(submitForReview("posting-1", "company-1")).resolves.toBeUndefined();
    expect(approvePosting).toHaveBeenCalledWith(
      "posting-1",
      "00000000-0000-0000-0000-000000000001",
      { fastLane: true },
    );
  });

  it("AC-7: fast-lane ineligible → approvePosting NOT called", async () => {
    vi.mocked(checkFastLaneEligibility).mockResolvedValueOnce({
      eligible: false,
      reasons: ["Screening not passed"],
    });

    await submitForReview("posting-1", "company-1");
    expect(approvePosting).not.toHaveBeenCalled();
  });

  it("throws 409 when not a draft or rejected", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...BASE_POSTING,
      status: "pending_review",
    } as never);
    await expect(submitForReview("posting-1", "company-1")).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(submitForReview("unknown", "company-1")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when ownership mismatch", async () => {
    await expect(submitForReview("posting-1", "wrong-company")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("renewPosting", () => {
  const EXPIRED_POSTING = {
    ...BASE_POSTING,
    status: "expired" as const,
    expiresAt: new Date("2026-01-01"),
  };
  const FUTURE_DATE = new Date(Date.now() + 86400000 * 30).toISOString();

  beforeEach(() => {
    vi.mocked(getJobPostingById).mockResolvedValue(EXPIRED_POSTING as never);
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(0);
    vi.mocked(updateJobPosting).mockResolvedValue(EXPIRED_POSTING as never);
  });

  it("renews without content change → transitions to active", async () => {
    await expect(
      renewPosting("posting-1", "company-1", FUTURE_DATE, false, "EMPLOYER"),
    ).resolves.toBeUndefined();
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ status: "active", archivedAt: null }),
    );
  });

  it("renews with content change → transitions to pending_review", async () => {
    await expect(
      renewPosting("posting-1", "company-1", FUTURE_DATE, true, "EMPLOYER"),
    ).resolves.toBeUndefined();
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ status: "pending_review", archivedAt: null }),
    );
  });

  it("sets new expiresAt on renewal", async () => {
    await renewPosting("posting-1", "company-1", FUTURE_DATE, false, "EMPLOYER");
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ expiresAt: expect.any(Date) }),
    );
  });

  it("clears archivedAt on renewal (un-archive)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...EXPIRED_POSTING,
      archivedAt: new Date("2026-02-01"),
    } as never);
    await renewPosting("posting-1", "company-1", FUTURE_DATE, false, "EMPLOYER");
    expect(updateJobPosting).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ archivedAt: null }),
    );
  });

  it("throws 409 when active limit reached on renew without change", async () => {
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(5);
    await expect(
      renewPosting("posting-1", "company-1", FUTURE_DATE, false, "EMPLOYER"),
    ).rejects.toMatchObject({
      status: 409,
      extensions: { code: "PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED" },
    });
  });

  it("throws 400 when newExpiresAt is in the past", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    await expect(
      renewPosting("posting-1", "company-1", pastDate, false, "EMPLOYER"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 409 when posting is not expired", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await expect(
      renewPosting("posting-1", "company-1", FUTURE_DATE, false, "EMPLOYER"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(
      renewPosting("unknown", "company-1", FUTURE_DATE, false, "EMPLOYER"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 on ownership mismatch", async () => {
    await expect(
      renewPosting("posting-1", "wrong-company", FUTURE_DATE, false, "EMPLOYER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does NOT check active limit when contentChanged=true (goes to pending_review)", async () => {
    vi.mocked(countActivePostingsByCompanyId).mockResolvedValue(5);
    await expect(
      renewPosting("posting-1", "company-1", FUTURE_DATE, true, "EMPLOYER"),
    ).resolves.toBeUndefined();
    expect(countActivePostingsByCompanyId).not.toHaveBeenCalled();
  });
});

describe("editActivePosting", () => {
  beforeEach(() => {
    const returning = vi.fn().mockResolvedValue([{ ...BASE_POSTING, status: "pending_review" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
  });

  it("updates fields and transitions active posting to pending_review atomically", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await expect(
      editActivePosting(
        "posting-1",
        "company-1",
        { title: "New Title" },
        "2026-01-01T00:00:00.000Z",
      ),
    ).resolves.toBeUndefined();
    expect(db.update).toHaveBeenCalled();
  });

  it("throws 409 when optimistic lock fails (row was modified)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    const returning = vi.fn().mockResolvedValue([]); // empty = stale
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);

    await expect(
      editActivePosting("posting-1", "company-1", { title: "X" }, "2026-01-01T00:00:00.000Z"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(
      editActivePosting("unknown", "company-1", { title: "X" }, "2026-01-01T00:00:00.000Z"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when ownership mismatch", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({ ...BASE_POSTING, status: "active" } as never);
    await expect(
      editActivePosting("posting-1", "wrong-company", { title: "X" }, "2026-01-01T00:00:00.000Z"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
