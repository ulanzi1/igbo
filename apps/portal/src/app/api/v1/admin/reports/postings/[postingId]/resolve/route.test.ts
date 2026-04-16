// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-middleware", () => ({
  withApiHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/api-response", () => ({
  successResponse: (data: unknown) => new Response(JSON.stringify(data), { status: 200 }),
}));
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(opts: { title: string; status: number; detail?: string }) {
      super(opts.title);
      this.status = opts.status;
    }
  },
}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/posting-report-service", () => ({
  resolveReportsWithAction: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { resolveReportsWithAction } from "@/services/posting-report-service";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(resolveReportsWithAction).mockResolvedValue(2);
});

function makeRequest(postingId: string, body: unknown) {
  return new Request(`http://localhost/api/v1/admin/reports/postings/${postingId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/admin/reports/postings/[postingId]/resolve", () => {
  it("resolves reports and returns count", async () => {
    const req = makeRequest("posting-1", {
      resolutionAction: "reject",
      resolutionNote: "This posting was confirmed fraudulent after thorough investigation.",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(resolveReportsWithAction).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ resolutionAction: "reject" }),
    );
  });

  it("returns 400 for missing resolutionNote", async () => {
    const req = makeRequest("posting-1", { resolutionAction: "reject" });
    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for note too short", async () => {
    const req = makeRequest("posting-1", {
      resolutionAction: "reject",
      resolutionNote: "short",
    });
    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("requires admin role", async () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(requireJobAdminRole).mockRejectedValue(err);
    const req = makeRequest("posting-1", {
      resolutionAction: "reject",
      resolutionNote: "This was confirmed fraudulent after thorough investigation.",
    });
    await expect(POST(req)).rejects.toMatchObject({ status: 403 });
  });
});
