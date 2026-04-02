// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("@igbo/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@igbo/db/schema/audit-logs", () => ({
  auditLogs: { __table: "audit_logs" },
}));

mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockResolvedValue(undefined);

import { logAdminAction } from "./audit-logger";

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockResolvedValue(undefined);
});

describe("logAdminAction", () => {
  it("inserts an audit log with all fields", async () => {
    await logAdminAction({
      actorId: "admin-1",
      action: "APPROVE_APPLICATION",
      targetUserId: "user-1",
      details: { targetUserId: "user-1" },
      ipAddress: "1.2.3.4",
    });

    expect(mockValues).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "APPROVE_APPLICATION",
      targetUserId: "user-1",
      targetType: null,
      traceId: null,
      details: { targetUserId: "user-1" },
      ipAddress: "1.2.3.4",
    });
  });

  it("defaults details and ipAddress to null when omitted", async () => {
    await logAdminAction({
      actorId: "admin-1",
      action: "REJECT_APPLICATION",
      targetUserId: "user-1",
    });

    expect(mockValues).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "REJECT_APPLICATION",
      targetUserId: "user-1",
      targetType: null,
      traceId: null,
      details: null,
      ipAddress: null,
    });
  });
});
