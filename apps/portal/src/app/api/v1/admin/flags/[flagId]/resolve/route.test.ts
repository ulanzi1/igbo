// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({
  requireJobAdminRole: vi.fn(),
}));
vi.mock("@/services/admin-review-service", () => ({
  resolveFlagWithAction: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { resolveFlagWithAction } from "@/services/admin-review-service";
import { ApiError } from "@igbo/auth/api-error";
import { POST } from "./route";

function makeRequest(flagId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/flags/${flagId}/resolve`, {
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
});

describe("POST /api/v1/admin/flags/[flagId]/resolve", () => {
  it("resolves a flag with request_changes and returns 200", async () => {
    vi.mocked(resolveFlagWithAction).mockResolvedValue(undefined);

    const req = makeRequest("flag-1", {
      action: "request_changes",
      note: "Posting contains misleading salary information that needs correction.",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(resolveFlagWithAction).toHaveBeenCalledWith(
      "flag-1",
      "admin-1",
      "request_changes",
      "Posting contains misleading salary information that needs correction.",
    );
  });

  it("resolves a flag with reject action", async () => {
    vi.mocked(resolveFlagWithAction).mockResolvedValue(undefined);

    const req = makeRequest("flag-1", {
      action: "reject",
      note: "Posting is a confirmed scam and must be removed from the platform.",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(resolveFlagWithAction).toHaveBeenCalledWith(
      "flag-1",
      "admin-1",
      "reject",
      "Posting is a confirmed scam and must be removed from the platform.",
    );
  });

  it("returns 400 for note too short", async () => {
    const req = makeRequest("flag-1", {
      action: "reject",
      note: "Too short",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action", async () => {
    const req = makeRequest("flag-1", {
      action: "dismiss",
      note: "Posting contains misleading salary information that needs correction.",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );

    const req = makeRequest("flag-1", {
      action: "reject",
      note: "Posting is a confirmed scam and must be removed from the platform.",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 404 when flag not found", async () => {
    vi.mocked(resolveFlagWithAction).mockRejectedValue(
      new ApiError({
        title: "Flag not found or already resolved",
        status: 404,
        extensions: { code: "PORTAL_ERRORS.FLAG_NOT_FOUND" },
      }),
    );

    const req = makeRequest("flag-999", {
      action: "reject",
      note: "Posting is a confirmed scam and must be removed from the platform.",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
