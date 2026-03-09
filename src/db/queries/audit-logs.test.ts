// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/db/schema/audit-logs", () => ({
  auditLogs: {
    id: "id",
    actorId: "actor_id",
    action: "action",
    targetUserId: "target_user_id",
    targetType: "target_type",
    traceId: "trace_id",
    details: "details",
    createdAt: "created_at",
  },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: {
    id: "id",
    name: "name",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join("?"), values }),
    { join: vi.fn(() => ({})) },
  ),
  eq: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

import { listAuditLogs } from "./audit-logs";

function makeSelectChain(rows: unknown[], count = 1) {
  const countChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count }]),
  };
  const rowsChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
  let call = 0;
  mockSelect.mockImplementation(() => {
    call++;
    return call === 1 ? rowsChain : countChain;
  });
  return { rowsChain, countChain };
}

const sampleRow = {
  id: "log-1",
  actorId: "actor-1",
  actorName: "Admin User",
  action: "BAN_MEMBER",
  targetUserId: "target-1",
  targetType: "user",
  traceId: "trace-abc",
  details: { reason: "spam" },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated rows with no filters", async () => {
    makeSelectChain([sampleRow], 1);
    const result = await listAuditLogs(1, 20);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe("BAN_MEMBER");
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("filters by action", async () => {
    makeSelectChain([sampleRow], 1);
    const result = await listAuditLogs(1, 20, { action: "BAN_MEMBER" });
    expect(result.logs[0].action).toBe("BAN_MEMBER");
  });

  it("filters by actorId", async () => {
    makeSelectChain([sampleRow], 1);
    const result = await listAuditLogs(1, 20, { actorId: "actor-1" });
    expect(result.logs[0].actorId).toBe("actor-1");
  });

  it("filters by targetType", async () => {
    makeSelectChain([sampleRow], 1);
    const result = await listAuditLogs(1, 20, { targetType: "user" });
    expect(result.logs[0].targetType).toBe("user");
  });

  it("filters by dateFrom and dateTo", async () => {
    makeSelectChain([sampleRow], 1);
    const result = await listAuditLogs(1, 20, { dateFrom: "2026-01-01", dateTo: "2026-01-31" });
    expect(result.logs).toHaveLength(1);
  });

  it("calculates totalPages correctly", async () => {
    makeSelectChain([], 45);
    const result = await listAuditLogs(1, 20);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
  });

  it("returns empty results when count is 0", async () => {
    makeSelectChain([], 0);
    const result = await listAuditLogs(1, 20);
    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("passes page and limit correctly", async () => {
    makeSelectChain([sampleRow], 30);
    const result = await listAuditLogs(2, 10);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3);
  });
});
