// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  getReviewDetail: vi.fn(),
  approvePosting: vi.fn(),
  rejectPosting: vi.fn(),
  requestChanges: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import {
  getReviewDetail,
  approvePosting,
  rejectPosting,
  requestChanges,
} from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { GET, POST } from "./route";

const mockDetail = {
  posting: {
    id: "posting-1",
    title: "Software Engineer",
    descriptionHtml: "<p>Great role</p>",
    status: "pending_review",
    createdAt: new Date("2026-01-01"),
    revisionCount: 0,
  },
  company: { id: "company-1", name: "Tech Corp", trustBadge: true, ownerUserId: "user-1" },
  employerName: "John Doe",
  totalPostings: 5,
  approvedCount: 4,
  rejectedCount: 1,
  confidenceIndicator: {
    level: "high",
    verifiedEmployer: true,
    violationCount: 0,
    reportCount: 0,
    engagementLevel: "high",
  },
  screeningResult: null,
  reportCount: 0,
};

function makeRequest(jobId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/jobs/${jobId}/review`, {
    method: "GET",
    headers: { Host: "jobs.igbo.com" },
  });
}

function makePostRequest(jobId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/jobs/${jobId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "jobs.igbo.com",
      Origin: "https://jobs.igbo.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getReviewDetail).mockResolvedValue(mockDetail as never);
  vi.mocked(approvePosting).mockResolvedValue(undefined);
  vi.mocked(rejectPosting).mockResolvedValue(undefined);
  vi.mocked(requestChanges).mockResolvedValue(undefined);
});

describe("GET /api/v1/admin/jobs/[jobId]/review", () => {
  it("returns review detail for JOB_ADMIN (200)", async () => {
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.posting.id).toBe("posting-1");
    expect(body.data.company.name).toBe("Tech Corp");
    expect(body.data.totalPostings).toBe(5);
  });

  it("rejects non-admin role with 403", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated request with 401", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent jobId", async () => {
    vi.mocked(getReviewDetail).mockResolvedValue(null);
    const res = await GET(makeRequest("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns full review context in response", async () => {
    const res = await GET(makeRequest("posting-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.approvedCount).toBe(4);
    expect(body.data.rejectedCount).toBe(1);
    expect(body.data.confidenceIndicator.level).toBe("high");
    expect(body.data.screeningResult).toBeNull();
  });
});

describe("POST /api/v1/admin/jobs/[jobId]/review", () => {
  it("approves a posting (201)", async () => {
    const res = await POST(makePostRequest("posting-1", { decision: "approved" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.decision).toBe("approved");
    expect(approvePosting).toHaveBeenCalledWith("posting-1", "admin-1");
  });

  it("rejects a posting with reason and category (201)", async () => {
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "rejected",
        reason: "This posting violates community guidelines.",
        category: "policy_violation",
      }),
    );
    expect(res.status).toBe(201);
    expect(rejectPosting).toHaveBeenCalledWith(
      "posting-1",
      "admin-1",
      "This posting violates community guidelines.",
      "policy_violation",
    );
  });

  it("requests changes with feedbackComment (201)", async () => {
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "changes_requested",
        feedbackComment: "Please improve the job description with more detail.",
      }),
    );
    expect(res.status).toBe(201);
    expect(requestChanges).toHaveBeenCalledWith(
      "posting-1",
      "admin-1",
      "Please improve the job description with more detail.",
    );
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await POST(makePostRequest("posting-1", { decision: "approved" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid decision value", async () => {
    const res = await POST(makePostRequest("posting-1", { decision: "invalid_decision" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when reject decision is missing reason", async () => {
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "rejected",
        category: "other",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when reject decision is missing category", async () => {
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "rejected",
        reason: "This posting violates community guidelines.",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when changes_requested is missing feedbackComment", async () => {
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "changes_requested",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 from service when max revisions reached", async () => {
    vi.mocked(requestChanges).mockRejectedValue(
      new ApiError({
        title: "Max revisions",
        status: 409,
        extensions: { code: "PORTAL_ERRORS.MAX_REVISIONS_REACHED" },
      }),
    );
    const res = await POST(
      makePostRequest("posting-1", {
        decision: "changes_requested",
        feedbackComment: "Please improve the job description significantly.",
      }),
    );
    expect(res.status).toBe(409);
  });
});
