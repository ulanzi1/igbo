// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRequireAdminSession, mockEnqueueEmailJob, mockSelectWhere, mockInsertValues } =
  vi.hoisted(() => {
    const _mockInsertValues = vi.fn().mockResolvedValue(undefined);
    return {
      mockRequireAdminSession: vi.fn(),
      mockEnqueueEmailJob: vi.fn(),
      mockSelectWhere: vi.fn(),
      mockInsertValues: _mockInsertValues,
    };
  });

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: (...args: unknown[]) => mockEnqueueEmailJob(...args),
}));

vi.mock("@igbo/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockSelectWhere,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: mockInsertValues,
    }),
  },
}));

vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    email: "email",
    name: "name",
  },
}));

vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: {},
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { POST } from "./route";

const ADMIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MEMBER_ID = "11111111-2222-4333-8444-555555555555";

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/admin/breach-response/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockSelectWhere.mockResolvedValue([
    { id: MEMBER_ID, email: "member@example.com", name: "Test Member" },
  ]);
  mockInsertValues.mockResolvedValue(undefined);
});

describe("POST /api/v1/admin/breach-response/notify", () => {
  it("returns 200 and sends notification emails", async () => {
    const req = makePostRequest({
      userIds: [MEMBER_ID],
      incidentTimestamp: "2024-06-15T12:00:00Z",
      notificationMessage: "A data breach was detected.",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notifiedCount).toBe(1);
    expect(mockEnqueueEmailJob).toHaveBeenCalledTimes(1);
  });

  it("logs to audit trail", async () => {
    const req = makePostRequest({
      userIds: [MEMBER_ID],
      incidentTimestamp: "2024-06-15T12:00:00Z",
      notificationMessage: "Breach details.",
    });
    await POST(req);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_ID,
        action: "admin.breach_notification_sent",
      }),
    );
  });

  it("returns 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const req = makePostRequest({
      userIds: [MEMBER_ID],
      incidentTimestamp: "2024-06-15T12:00:00Z",
      notificationMessage: "Breach details.",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty userIds array", async () => {
    const req = makePostRequest({
      userIds: [],
      incidentTimestamp: "2024-06-15T12:00:00Z",
      notificationMessage: "Breach details.",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UUID in userIds", async () => {
    const req = makePostRequest({
      userIds: ["not-a-uuid"],
      incidentTimestamp: "2024-06-15T12:00:00Z",
      notificationMessage: "Breach details.",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing notificationMessage", async () => {
    const req = makePostRequest({
      userIds: [MEMBER_ID],
      incidentTimestamp: "2024-06-15T12:00:00Z",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/v1/admin/breach-response/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
