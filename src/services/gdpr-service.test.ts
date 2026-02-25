// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindUserById = vi.fn();
const mockVerifyPassword = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockEventBusEmit = vi.fn();
const mockEnqueueEmailJob = vi.fn();
const mockRunJob = vi.fn();
const mockCreateExportRequest = vi.fn();
const mockUpdateExportRequest = vi.fn();
const mockFindAccountsPendingAnonymization = vi.fn();

vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

vi.mock("@/services/auth-service", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: vi.fn(),
}));

vi.mock("@/db/queries/gdpr", () => ({
  createExportRequest: (...args: unknown[]) => mockCreateExportRequest(...args),
  updateExportRequest: (...args: unknown[]) => mockUpdateExportRequest(...args),
  findAccountsPendingAnonymization: (...args: unknown[]) =>
    mockFindAccountsPendingAnonymization(...args),
  getExportRequestByToken: vi.fn(),
  getUserExportRequests: vi.fn(),
}));

const mockDbChain = {
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([]),
};

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return mockDbChain;
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return mockDbChain;
    },
  },
}));

const mockRedisClient = {
  get: (...args: unknown[]) => mockRedisGet(...args),
  set: (...args: unknown[]) => mockRedisSet(...args),
  del: (...args: unknown[]) => mockRedisDel(...args),
};

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockRedisClient,
  getRedisPublisher: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEventBusEmit(...args),
  },
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: (...args: unknown[]) => mockEnqueueEmailJob(...args),
}));

vi.mock("@/server/jobs/job-runner", () => ({
  runJob: (...args: unknown[]) => mockRunJob(...args),
  registerJob: vi.fn(),
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    accountStatus: "account_status",
    scheduledDeletionAt: "scheduled_deletion_at",
  },
}));

vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: { userId: "user_id" },
}));

vi.mock("@/db/schema/audit-logs", () => ({
  auditLogs: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  requestAccountDeletion,
  cancelAccountDeletion,
  anonymizeAccount,
  requestDataExport,
} from "./gdpr-service";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const mockUser = {
  id: USER_ID,
  email: "test@example.com",
  name: "Test User",
  passwordHash: "$2a$12$hashedpassword",
  accountStatus: "APPROVED" as const,
  scheduledDeletionAt: null,
  deletedAt: null,
  role: "MEMBER" as const,
  membershipTier: "BASIC" as const,
  languagePreference: "en",
  createdAt: new Date(),
  updatedAt: new Date(),
  emailVerified: null,
  phone: null,
  locationCity: null,
  locationState: null,
  locationCountry: null,
  culturalConnection: null,
  reasonForJoining: null,
  referralName: null,
  consentGivenAt: new Date(),
  consentIp: null,
  consentVersion: "1.0",
  image: null,
  adminNotes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDbChain.update.mockReturnThis();
  mockDbChain.set.mockReturnThis();
  mockDbChain.where.mockResolvedValue([]);
  mockDbChain.insert.mockReturnThis();
  mockDbChain.values.mockResolvedValue([]);
  mockRunJob.mockResolvedValue(true);
});

describe("requestAccountDeletion", () => {
  it("throws 404 when user not found", async () => {
    mockFindUserById.mockResolvedValue(null);
    await expect(requestAccountDeletion(USER_ID, "password")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 when password is incorrect", async () => {
    mockFindUserById.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(false);
    await expect(requestAccountDeletion(USER_ID, "wrongpass")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("sets accountStatus to PENDING_DELETION and schedules deletion", async () => {
    mockFindUserById.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockRedisSet.mockResolvedValue("OK");

    await requestAccountDeletion(USER_ID, "correctpass");

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockRedisSet).toHaveBeenCalledWith(
      `gdpr:cancel:${USER_ID}`,
      expect.any(String),
      "EX",
      expect.any(Number),
    );
  });

  it("sends cancellation email", async () => {
    mockFindUserById.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockRedisSet.mockResolvedValue("OK");

    await requestAccountDeletion(USER_ID, "correctpass");

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining("gdpr-cancel"),
      expect.objectContaining({ to: mockUser.email }),
    );
  });

  it("emits member.deletion_requested event", async () => {
    mockFindUserById.mockResolvedValue(mockUser);
    mockVerifyPassword.mockResolvedValue(true);
    mockRedisSet.mockResolvedValue("OK");

    await requestAccountDeletion(USER_ID, "correctpass");

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.deletion_requested",
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});

describe("cancelAccountDeletion", () => {
  it("throws 400 when token is invalid", async () => {
    mockRedisGet.mockResolvedValue("correct-token");
    await expect(cancelAccountDeletion("wrong-token", USER_ID)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when token not found in Redis", async () => {
    mockRedisGet.mockResolvedValue(null);
    await expect(cancelAccountDeletion("some-token", USER_ID)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("resets accountStatus to APPROVED and clears scheduledDeletionAt", async () => {
    const token = "valid-cancel-token";
    mockRedisGet.mockResolvedValue(token);
    mockRedisDel.mockResolvedValue(1);

    await cancelAccountDeletion(token, USER_ID);

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockRedisDel).toHaveBeenCalledWith(`gdpr:cancel:${USER_ID}`);
  });
});

describe("anonymizeAccount", () => {
  it("emits member.anonymizing BEFORE scrubbing PII", async () => {
    const emitOrder: string[] = [];
    mockEventBusEmit.mockImplementation((event: string) => {
      emitOrder.push(event);
      return true;
    });

    await anonymizeAccount(USER_ID);

    expect(emitOrder[0]).toBe("member.anonymizing");
    expect(emitOrder).toContain("member.anonymized");
    expect(emitOrder.indexOf("member.anonymizing")).toBeLessThan(
      emitOrder.indexOf("member.anonymized"),
    );
  });

  it("updates authUsers with anonymized data", async () => {
    await anonymizeAccount(USER_ID);
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Former Member",
        accountStatus: "ANONYMIZED",
      }),
    );
  });

  it("emits member.anonymized after scrubbing", async () => {
    await anonymizeAccount(USER_ID);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.anonymized",
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("inserts an audit log entry", async () => {
    await anonymizeAccount(USER_ID);
    expect(mockDbInsert).toHaveBeenCalled();
  });
});

describe("requestDataExport", () => {
  it("creates a DB export request record", async () => {
    const requestId = "req-uuid-1234";
    mockCreateExportRequest.mockResolvedValue({
      id: requestId,
      userId: USER_ID,
      status: "pending",
    });
    mockRedisSet.mockResolvedValue("OK");

    const result = await requestDataExport(USER_ID);

    expect(mockCreateExportRequest).toHaveBeenCalledWith(USER_ID);
    expect(result.requestId).toBe(requestId);
  });

  it("stores requestId in Redis", async () => {
    const requestId = "req-uuid-5678";
    mockCreateExportRequest.mockResolvedValue({
      id: requestId,
      userId: USER_ID,
      status: "pending",
    });
    mockRedisSet.mockResolvedValue("OK");

    await requestDataExport(USER_ID);

    expect(mockRedisSet).toHaveBeenCalledWith(`gdpr:export:${USER_ID}`, requestId, "EX", 3600);
  });

  it("enqueues the data-export job", async () => {
    mockCreateExportRequest.mockResolvedValue({ id: "req-1", userId: USER_ID, status: "pending" });
    mockRedisSet.mockResolvedValue("OK");

    await requestDataExport(USER_ID);

    expect(mockRunJob).toHaveBeenCalledWith("data-export");
  });
});
