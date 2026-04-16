// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: (data: unknown, _msg: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status }),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    extensions?: Record<string, unknown>;
    constructor(opts: {
      title: string;
      status: number;
      detail?: string;
      extensions?: Record<string, unknown>;
    }) {
      super(opts.title);
      this.status = opts.status;
      this.extensions = opts.extensions;
    }
  },
}));
vi.mock("@/services/posting-report-service", () => ({
  submitReport: vi.fn(),
}));

import { auth } from "@igbo/auth";
import { submitReport } from "@/services/posting-report-service";
import { POST } from "./route";
import { postingReportFactory } from "@/test/factories";

const MOCK_REPORT = postingReportFactory({
  id: "report-1",
  postingId: "posting-1",
  reporterUserId: "user-1",
  createdAt: new Date("2026-04-10"),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "user-1", activePortalRole: "JOB_SEEKER" },
  } as never);
  vi.mocked(submitReport).mockResolvedValue(MOCK_REPORT as never);
});

function makeRequest(postingId: string, body: unknown) {
  return new Request(`http://localhost/api/v1/reports/postings/${postingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/reports/postings/[postingId]", () => {
  it("returns 201 with created report", async () => {
    const req = makeRequest("posting-1", {
      category: "scam_fraud",
      description: "This looks like a scam with too-good-to-be-true claims.",
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        postingId: "posting-1",
        reporterUserId: "user-1",
        category: "scam_fraud",
      }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = makeRequest("posting-1", { category: "scam_fraud", description: "desc" });

    await expect(POST(req)).rejects.toMatchObject({ status: 401 });
  });

  it("returns 400 for invalid category", async () => {
    const req = makeRequest("posting-1", {
      category: "invalid_category",
      description: "This looks like a scam with too-good-to-be-true claims.",
    });

    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for description too short", async () => {
    const req = makeRequest("posting-1", {
      category: "scam_fraud",
      description: "short",
    });

    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("propagates service errors", async () => {
    const err = Object.assign(new Error("Already reported"), { status: 409 });
    vi.mocked(submitReport).mockRejectedValue(err);
    const req = makeRequest("posting-1", {
      category: "scam_fraud",
      description: "This looks like a scam with too-good-to-be-true claims.",
    });

    await expect(POST(req)).rejects.toMatchObject({ status: 409 });
  });
});
