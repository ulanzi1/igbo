// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetDisciplineActionById = vi.fn();
const mockLiftSuspensionEarly = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/member-discipline", () => ({
  getDisciplineActionById: (...args: unknown[]) => mockGetDisciplineActionById(...args),
}));

vi.mock("@/services/member-discipline-service", () => ({
  liftSuspensionEarly: (...args: unknown[]) => mockLiftSuspensionEarly(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "admin-uuid-1";
const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const SUSPENSION_ID = "00000000-0000-4000-8000-000000000099";

function makeRequest(userId: string, body?: unknown) {
  return new Request(`https://example.com/api/v1/admin/discipline/${userId}/lift`, {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockGetDisciplineActionById.mockResolvedValue({
    id: SUSPENSION_ID,
    userId: VALID_UUID,
    actionType: "suspension",
    status: "active",
  });
  mockLiftSuspensionEarly.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/discipline/[userId]/lift", () => {
  it("returns 200 and calls liftSuspensionEarly on valid request", async () => {
    const res = await POST(
      makeRequest(VALID_UUID, { suspensionId: SUSPENSION_ID, reason: "Good behavior" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.lifted).toBe(true);
    expect(mockLiftSuspensionEarly).toHaveBeenCalledWith({
      suspensionId: SUSPENSION_ID,
      adminId: ADMIN_ID,
      reason: "Good behavior",
    });
  });

  it("returns 400 for invalid userId", async () => {
    const res = await POST(
      makeRequest("not-a-uuid", { suspensionId: SUSPENSION_ID, reason: "Good behavior" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when reason is missing", async () => {
    const res = await POST(makeRequest(VALID_UUID, { suspensionId: SUSPENSION_ID }));
    expect(res.status).toBe(422);
    expect(mockLiftSuspensionEarly).not.toHaveBeenCalled();
  });

  it("returns 422 when suspensionId is missing", async () => {
    const res = await POST(makeRequest(VALID_UUID, { reason: "Good behavior" }));
    expect(res.status).toBe(422);
    expect(mockLiftSuspensionEarly).not.toHaveBeenCalled();
  });

  it("returns 400 when suspension.userId doesn't match URL userId", async () => {
    const otherUserId = "00000000-0000-4000-8000-000000000002";
    mockGetDisciplineActionById.mockResolvedValue({
      id: SUSPENSION_ID,
      userId: otherUserId,
      actionType: "suspension",
      status: "active",
    });
    const res = await POST(
      makeRequest(VALID_UUID, { suspensionId: SUSPENSION_ID, reason: "Good behavior" }),
    );
    expect(res.status).toBe(400);
    expect(mockLiftSuspensionEarly).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await POST(
      makeRequest(VALID_UUID, { suspensionId: SUSPENSION_ID, reason: "Good behavior" }),
    );
    expect(res.status).toBe(403);
  });
});
