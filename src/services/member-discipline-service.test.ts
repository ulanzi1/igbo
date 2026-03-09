// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockFindUserById = vi.hoisted(() => vi.fn());
const mockFindActiveSessionsByUserId = vi.hoisted(() => vi.fn());
const mockDeleteAllSessionsForUser = vi.hoisted(() => vi.fn());
const mockEvictAllUserSessions = vi.hoisted(() => vi.fn());
const mockCreateDisciplineAction = vi.hoisted(() => vi.fn());
const mockListSuspensionsExpiringBefore = vi.hoisted(() => vi.fn());
const mockExpireDisciplineAction = vi.hoisted(() => vi.fn());
const mockLogAdminAction = vi.hoisted(() => vi.fn());
const mockEventBusEmit = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: mockDbUpdate,
  },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: "id", accountStatus: "account_status", updatedAt: "updated_at" },
}));

vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: mockFindUserById,
}));

vi.mock("@/db/queries/auth-sessions", () => ({
  findActiveSessionsByUserId: mockFindActiveSessionsByUserId,
  deleteAllSessionsForUser: mockDeleteAllSessionsForUser,
}));

vi.mock("@/server/auth/redis-session-cache", () => ({
  evictAllUserSessions: mockEvictAllUserSessions,
}));

vi.mock("@/db/queries/member-discipline", () => ({
  createDisciplineAction: mockCreateDisciplineAction,
  listSuspensionsExpiringBefore: mockListSuspensionsExpiringBefore,
  expireDisciplineAction: mockExpireDisciplineAction,
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: mockLogAdminAction,
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: mockEventBusEmit },
}));

import {
  issueWarning,
  issueSuspension,
  issueBan,
  liftExpiredSuspensions,
} from "./member-discipline-service";

const buildUpdateChain = () => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUserById.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
  mockFindActiveSessionsByUserId.mockResolvedValue([{ sessionToken: "tok-1" }]);
  mockDeleteAllSessionsForUser.mockResolvedValue(undefined);
  mockEvictAllUserSessions.mockResolvedValue(undefined);
  mockCreateDisciplineAction.mockResolvedValue({ id: "disc-1" });
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("issueWarning", () => {
  it("creates a warning discipline record and logs admin action", async () => {
    const result = await issueWarning({
      targetUserId: "user-1",
      adminId: "admin-1",
      reason: "Spam",
    });

    expect(result).toEqual({ id: "disc-1" });
    expect(mockCreateDisciplineAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "warning", userId: "user-1" }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WARN_MEMBER", targetUserId: "user-1" }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "account.discipline_issued",
      expect.objectContaining({ disciplineType: "warning" }),
    );
  });

  it("does NOT evict sessions for warnings", async () => {
    await issueWarning({ targetUserId: "user-1", adminId: "admin-1", reason: "Spam" });
    expect(mockEvictAllUserSessions).not.toHaveBeenCalled();
  });
});

describe("issueSuspension", () => {
  it("updates account status to SUSPENDED and evicts sessions", async () => {
    buildUpdateChain();
    await issueSuspension({
      targetUserId: "user-1",
      adminId: "admin-1",
      reason: "Harassment",
      durationHours: 24,
    });

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockEvictAllUserSessions).toHaveBeenCalledWith(["tok-1"]);
    expect(mockDeleteAllSessionsForUser).toHaveBeenCalledWith("user-1");
    expect(mockCreateDisciplineAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "suspension" }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SUSPEND_MEMBER" }),
    );
  });

  it("emits account.status_changed with SUSPENDED newStatus", async () => {
    buildUpdateChain();
    await issueSuspension({
      targetUserId: "user-1",
      adminId: "admin-1",
      reason: "Harassment",
      durationHours: 168,
    });

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "account.status_changed",
      expect.objectContaining({ userId: "user-1", newStatus: "SUSPENDED", oldStatus: "APPROVED" }),
    );
  });
});

describe("issueBan", () => {
  it("updates account status to BANNED and evicts sessions", async () => {
    buildUpdateChain();
    await issueBan({
      targetUserId: "user-1",
      adminId: "admin-1",
      reason: "Severe violation",
    });

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockEvictAllUserSessions).toHaveBeenCalledWith(["tok-1"]);
    expect(mockDeleteAllSessionsForUser).toHaveBeenCalledWith("user-1");
    expect(mockCreateDisciplineAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "ban" }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BAN_MEMBER" }),
    );
  });

  it("emits account.status_changed with BANNED newStatus", async () => {
    buildUpdateChain();
    await issueBan({ targetUserId: "user-1", adminId: "admin-1", reason: "Severe violation" });

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "account.status_changed",
      expect.objectContaining({ newStatus: "BANNED" }),
    );
  });
});

describe("liftExpiredSuspensions", () => {
  it("lifts SUSPENDED users and restores APPROVED status", async () => {
    const suspensions = [
      { id: "disc-1", userId: "user-1", suspensionEndsAt: new Date("2026-01-01") },
    ];
    mockListSuspensionsExpiringBefore.mockResolvedValue(suspensions);
    mockFindUserById.mockResolvedValue({ id: "user-1", accountStatus: "SUSPENDED" });
    buildUpdateChain();

    const count = await liftExpiredSuspensions(new Date("2026-03-09"));

    expect(count).toBe(1);
    expect(mockExpireDisciplineAction).toHaveBeenCalledWith("disc-1");
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "system",
        action: "LIFT_SUSPENSION",
        targetUserId: "user-1",
        details: { disciplineId: "disc-1" },
      }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "account.status_changed",
      expect.objectContaining({ userId: "user-1", newStatus: "APPROVED", oldStatus: "SUSPENDED" }),
    );
  });

  it("skips BANNED users even if suspension record exists", async () => {
    const suspensions = [
      { id: "disc-1", userId: "user-2", suspensionEndsAt: new Date("2026-01-01") },
    ];
    mockListSuspensionsExpiringBefore.mockResolvedValue(suspensions);
    mockFindUserById.mockResolvedValue({ id: "user-2", accountStatus: "BANNED" });

    const count = await liftExpiredSuspensions(new Date("2026-03-09"));

    expect(count).toBe(0);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("skips PENDING_DELETION users", async () => {
    const suspensions = [
      { id: "disc-1", userId: "user-3", suspensionEndsAt: new Date("2026-01-01") },
    ];
    mockListSuspensionsExpiringBefore.mockResolvedValue(suspensions);
    mockFindUserById.mockResolvedValue({ id: "user-3", accountStatus: "PENDING_DELETION" });

    const count = await liftExpiredSuspensions(new Date("2026-03-09"));

    expect(count).toBe(0);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 0 when no suspensions are expiring", async () => {
    mockListSuspensionsExpiringBefore.mockResolvedValue([]);
    const count = await liftExpiredSuspensions(new Date("2026-03-09"));
    expect(count).toBe(0);
  });
});
