// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
vi.mock("@/services/employer-verification-service", () => ({
  rejectVerificationRequest: vi.fn(),
}));

import { requireJobAdminRole } from "@/lib/portal-permissions";
import { rejectVerificationRequest } from "@/services/employer-verification-service";
import { POST } from "./route";

const validReason =
  "Insufficient documentation provided; please resubmit with official registration certificate.";

function makeRequest(verificationId: string, body: unknown): Request {
  return new Request(`https://jobs.igbo.com/api/v1/admin/verifications/${verificationId}/reject`, {
    method: "POST",
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
  vi.mocked(requireJobAdminRole).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(rejectVerificationRequest).mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/verifications/[verificationId]/reject", () => {
  it("rejects verification with valid reason and returns 200", async () => {
    const res = await POST(makeRequest("ver-1", { reason: validReason }));
    expect(res.status).toBe(200);
    expect(rejectVerificationRequest).toHaveBeenCalledWith("ver-1", "admin-1", validReason);
  });

  it("returns 400 for reason too short", async () => {
    const res = await POST(makeRequest("ver-1", { reason: "Too short" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing reason", async () => {
    const res = await POST(makeRequest("ver-1", {}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(requireJobAdminRole).mockRejectedValue(
      new ApiError({ title: "Forbidden", status: 403 }),
    );
    const res = await POST(makeRequest("ver-1", { reason: validReason }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when service throws not-found", async () => {
    const { ApiError } = await import("@igbo/auth/api-error");
    vi.mocked(rejectVerificationRequest).mockRejectedValue(
      new ApiError({ title: "Not found", status: 404 }),
    );
    const res = await POST(makeRequest("ver-x", { reason: validReason }));
    expect(res.status).toBe(404);
  });
});
