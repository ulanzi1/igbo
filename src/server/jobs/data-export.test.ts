// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockRegisterJob, handlerRef } = vi.hoisted(() => ({
  mockRegisterJob: vi.fn(),
  handlerRef: { current: null as (() => Promise<void>) | null },
}));

const mockDbChain = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};

vi.mock("@/db", () => ({
  db: {
    select: () => mockDbChain,
    update: () => mockDbChain,
  },
}));

vi.mock("@/db/schema/gdpr", () => ({
  gdprExportRequests: { status: "status", id: "id", userId: "user_id" },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: "id" },
}));

vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: { userId: "user_id" },
  communitySocialLinks: { userId: "user_id" },
}));

const mockRedisClient = {
  del: vi.fn().mockResolvedValue(1),
};

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockRedisClient,
  getRedisPublisher: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
}));

vi.mock("@/server/jobs/job-runner", () => ({
  registerJob: (name: string, handler: () => Promise<void>) => {
    mockRegisterJob(name, handler);
    handlerRef.current = handler;
  },
}));

// Import after mocks — side-effect: calls registerJob
import "./data-export";

beforeEach(() => {
  vi.clearAllMocks();
  mockDbChain.select.mockReturnThis();
  mockDbChain.from.mockReturnThis();
  mockDbChain.where.mockResolvedValue([]);
  mockDbChain.update.mockReturnThis();
  mockDbChain.set.mockReturnThis();
  mockDbChain.limit.mockResolvedValue([]);
});

describe("data-export job", () => {
  it("registers the job handler at module load time", () => {
    expect(handlerRef.current).toBeTypeOf("function");
  });

  it("runs without error when no pending requests", async () => {
    mockDbChain.where.mockResolvedValue([]);
    await expect(handlerRef.current!()).resolves.not.toThrow();
  });

  it("queries gdprExportRequests for pending rows", async () => {
    mockDbChain.where.mockResolvedValue([]);
    await handlerRef.current!();
    expect(mockDbChain.from).toHaveBeenCalled();
    expect(mockDbChain.where).toHaveBeenCalled();
  });
});
