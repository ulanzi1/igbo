// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@/services/employer-verification-service", () => ({
  approveVerificationRequest: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { approveVerificationRequest } from "@/services/employer-verification-service";
import { POST } from "./route";

function makeRequest(verificationId: string): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/verifications/${verificationId}/approve`, {
    method: "POST",
    headers: { Origin: "https://jobs.igbo.com", Host: "jobs.igbo.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(approveVerificationRequest).mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/verifications/[verificationId]/approve", () => {
  it("approves verification and returns 200", async () => {
    const res = await POST(makeRequest("ver-1"));
    expect(res.status).toBe(200);
    expect(approveVerificationRequest).toHaveBeenCalledWith("ver-1", "admin-1");
  });

  it("returns 403 for non-admin", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await POST(makeRequest("ver-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when service throws not-found", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(approveVerificationRequest).mockRejectedValue(
      new ApiError({ title: "Not found", status: 404 }),
    );
    const res = await POST(makeRequest("ver-x"));
    expect(res.status).toBe(404);
  });
});
