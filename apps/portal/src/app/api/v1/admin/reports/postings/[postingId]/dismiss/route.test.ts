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
  dismissReports: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { dismissReports } from "@/services/posting-report-service";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(dismissReports).mockResolvedValue(1);
});

function makeRequest(postingId: string, body: unknown) {
  return new Request(`http://localhost/api/v1/admin/reports/postings/${postingId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/admin/reports/postings/[postingId]/dismiss", () => {
  it("dismisses reports and returns count", async () => {
    const req = makeRequest("posting-1", {
      resolutionNote: "Reviewed all reports and found no policy violations in this posting.",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dismissReports).toHaveBeenCalledWith(
      "posting-1",
      expect.objectContaining({ resolutionNote: expect.any(String) }),
    );
  });

  it("returns 400 for note too short", async () => {
    const req = makeRequest("posting-1", { resolutionNote: "too short" });
    await expect(POST(req)).rejects.toMatchObject({ status: 400 });
  });

  it("requires admin role", async () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    vi.mocked(requireJobAdminRole).mockRejectedValue(err);
    const req = makeRequest("posting-1", {
      resolutionNote: "Reviewed all reports and found no policy violations in this posting.",
    });
    await expect(POST(req)).rejects.toMatchObject({ status: 403 });
  });
});
