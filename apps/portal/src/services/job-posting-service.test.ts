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

import { db } from "@igbo/db";
import {
  getJobPostingById,
  countActivePostingsByCompanyId,
  updateJobPostingStatus,
  updateJobPosting,
} from "@igbo/db/queries/portal-job-postings";
import {
  canEditPosting,
  transitionStatus,
  closePosting,
  submitForReview,
  editActivePosting,
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
  it("returns false for expired", () => expect(canEditPosting("expired")).toBe(false));
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

  it("throws 409 when posting is not active or paused (draft cannot be closed)", async () => {
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
  it("submits a complete draft for review", async () => {
    await expect(submitForReview("posting-1", "company-1")).resolves.toBeUndefined();
    expect(updateJobPostingStatus).toHaveBeenCalledWith("posting-1", "pending_review");
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
    expect(updateJobPostingStatus).toHaveBeenCalledWith("posting-1", "pending_review");
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
