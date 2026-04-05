// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireEmployerRole: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyByOwnerId: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));
vi.mock("@/services/job-posting-service", () => ({
  transitionStatus: vi.fn(),
  closePosting: vi.fn(),
  submitForReview: vi.fn(),
  renewPosting: vi.fn(),
}));

import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import {
  transitionStatus,
  closePosting,
  submitForReview,
  renewPosting,
} from "@/services/job-posting-service";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { PATCH } from "./route";

const employerSession = {
  user: { id: "user-123", activePortalRole: "EMPLOYER" },
};

const mockCompany = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePatchRequest(jobId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/jobs/${jobId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireEmployerRole).mockResolvedValue(employerSession as never);
  vi.mocked(getCompanyByOwnerId).mockResolvedValue(mockCompany);
  vi.mocked(transitionStatus).mockResolvedValue(undefined);
  vi.mocked(closePosting).mockResolvedValue(undefined);
  vi.mocked(submitForReview).mockResolvedValue(undefined);
  vi.mocked(renewPosting).mockResolvedValue(undefined);
  // Default: posting is not expired (so active → transitionStatus, not renewPosting)
  vi.mocked(getJobPostingById).mockResolvedValue(null);
});

describe("PATCH /api/v1/jobs/[jobId]/status", () => {
  it("submits for review (draft → pending_review) via submitForReview", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "pending_review" }));
    expect(res.status).toBe(200);
    expect(submitForReview).toHaveBeenCalledWith("posting-uuid", "company-uuid");
    expect(transitionStatus).not.toHaveBeenCalled();
  });

  it("pauses an active posting via transitionStatus", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      "posting-uuid",
      "paused",
      "company-uuid",
      "EMPLOYER",
      expect.any(Object),
    );
  });

  it("unpauses posting via transitionStatus (active)", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "active" }));
    expect(res.status).toBe(200);
    expect(transitionStatus).toHaveBeenCalledWith(
      "posting-uuid",
      "active",
      "company-uuid",
      "EMPLOYER",
      expect.any(Object),
    );
  });

  it("closes posting with outcome via closePosting", async () => {
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "filled",
        closedOutcome: "filled_internally",
      }),
    );
    expect(res.status).toBe(200);
    expect(closePosting).toHaveBeenCalledWith("posting-uuid", "filled_internally", "company-uuid");
    expect(transitionStatus).not.toHaveBeenCalled();
  });

  it("resubmits rejected posting via submitForReview (rejected → pending_review)", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "pending_review" }));
    expect(res.status).toBe(200);
    expect(submitForReview).toHaveBeenCalledWith("posting-uuid", "company-uuid");
  });

  it("returns 400 when targetStatus is filled but closedOutcome missing", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "filled" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when invalid transition (service throws INVALID_STATUS_TRANSITION)", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Invalid status transition",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(409);
  });

  it("returns 403 when employer tries to approve (admin-only transition guard)", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Forbidden",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "active" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.ROLE_MISMATCH");
  });

  it("returns 409 when active posting limit exceeded", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Active posting limit reached",
        status: 409,
        extensions: { code: PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "active" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED");
  });

  it("returns 409 when optimistic lock fails", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Stale",
        status: 409,
        extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
      }),
    );
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "paused",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when employer has no company profile", async () => {
    vi.mocked(getCompanyByOwnerId).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-employer role (requireEmployerRole rejects)", async () => {
    vi.mocked(requireEmployerRole).mockRejectedValue(
      new ApiError({
        title: "Employer role required",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid targetStatus value", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "invalid_status" }));
    expect(res.status).toBe(400);
  });

  it("always passes EMPLOYER role to transitionStatus (admin approval via separate Epic 3 route)", async () => {
    await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(transitionStatus).toHaveBeenCalledWith(
      "posting-uuid",
      "paused",
      "company-uuid",
      "EMPLOYER",
      expect.any(Object),
    );
  });

  it("passes expectedUpdatedAt to transitionStatus when provided", async () => {
    const ts = "2026-01-01T00:00:00.000Z";
    await PATCH(
      makePatchRequest("posting-uuid", { targetStatus: "paused", expectedUpdatedAt: ts }),
    );
    expect(transitionStatus).toHaveBeenCalledWith(
      "posting-uuid",
      "paused",
      "company-uuid",
      "EMPLOYER",
      { expectedUpdatedAt: ts },
    );
  });

  it("returns 403 when ownership mismatch (service throws)", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Forbidden",
        status: 403,
        extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when posting not found (service throws)", async () => {
    vi.mocked(transitionStatus).mockRejectedValue(
      new ApiError({
        title: "Not found",
        status: 404,
        extensions: { code: PORTAL_ERRORS.NOT_FOUND },
      }),
    );
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "paused" }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/jobs/[jobId]/status — renew expired posting", () => {
  const expiredPosting = {
    id: "posting-uuid",
    companyId: "company-uuid",
    status: "expired" as const,
    expiresAt: new Date("2025-12-01"),
    archivedAt: null,
  };

  beforeEach(() => {
    vi.mocked(getJobPostingById).mockResolvedValue(expiredPosting as never);
  });

  it("renews without content changes → 200, calls renewPosting(contentChanged=false)", async () => {
    const newExpiresAt = "2026-12-31T00:00:00.000Z";
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "active",
        newExpiresAt,
        contentChanged: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(renewPosting).toHaveBeenCalledWith(
      "posting-uuid",
      "company-uuid",
      newExpiresAt,
      false,
      "EMPLOYER",
    );
    expect(transitionStatus).not.toHaveBeenCalled();
  });

  it("renews with content changes → 200, calls renewPosting(contentChanged=true)", async () => {
    const newExpiresAt = "2026-12-31T00:00:00.000Z";
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "active",
        newExpiresAt,
        contentChanged: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(renewPosting).toHaveBeenCalledWith(
      "posting-uuid",
      "company-uuid",
      newExpiresAt,
      true,
      "EMPLOYER",
    );
  });

  it("returns 400 when newExpiresAt is missing for expired posting", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "active" }));
    expect(res.status).toBe(400);
    expect(renewPosting).not.toHaveBeenCalled();
  });

  it("returns 409 when renewPosting throws active posting limit exceeded", async () => {
    vi.mocked(renewPosting).mockRejectedValue(
      new ApiError({
        title: "Active posting limit reached",
        status: 409,
        extensions: { code: PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED },
      }),
    );
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "active",
        newExpiresAt: "2026-12-31T00:00:00.000Z",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("closes expired posting with filled outcome via closePosting", async () => {
    const res = await PATCH(
      makePatchRequest("posting-uuid", {
        targetStatus: "filled",
        closedOutcome: "filled_internally",
      }),
    );
    expect(res.status).toBe(200);
    expect(closePosting).toHaveBeenCalledWith("posting-uuid", "filled_internally", "company-uuid");
    expect(renewPosting).not.toHaveBeenCalled();
  });

  it("returns 400 when closing expired posting without closedOutcome", async () => {
    const res = await PATCH(makePatchRequest("posting-uuid", { targetStatus: "filled" }));
    expect(res.status).toBe(400);
    expect(closePosting).not.toHaveBeenCalled();
  });
});
