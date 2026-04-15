// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.hoisted(() => vi.fn());
const mockSelectDistinctOn = vi.hoisted(() => vi.fn());

vi.mock("../index", () => ({
  db: {
    select: mockSelect,
    selectDistinctOn: mockSelectDistinctOn,
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("../schema/audit-logs", () => ({
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

vi.mock("../schema/auth-users", () => ({
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
  like: vi.fn(() => ({})),
}));

import {
  listPortalAdminAuditLogs,
  listPortalAdminAuditLogsForExport,
  getDistinctPortalAuditAdmins,
  PORTAL_AUDIT_ACTIONS,
} from "./portal-admin-audit-logs";

const samplePortalRow = {
  id: "log-1",
  actorId: "admin-1",
  actorName: "Admin User",
  action: "portal.posting.approve",
  targetUserId: null,
  targetType: "portal_job_posting",
  traceId: null,
  details: { postingId: "p1", decision: "approved" },
  createdAt: new Date("2026-04-01T10:00:00Z"),
};

const sampleRow2 = {
  ...samplePortalRow,
  id: "log-2",
  action: "portal.flag.create",
  targetType: "portal_admin_flag",
  createdAt: new Date("2026-04-02T10:00:00Z"),
};

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

function makeExportSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function makeDistinctChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

describe("PORTAL_AUDIT_ACTIONS", () => {
  it("contains 15 portal action strings", () => {
    expect(PORTAL_AUDIT_ACTIONS).toHaveLength(15);
    expect(PORTAL_AUDIT_ACTIONS.every((a) => a.startsWith("portal."))).toBe(true);
  });
});

describe("listPortalAdminAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated rows with portal-prefix filter applied", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]?.action).toBe("portal.posting.approve");
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("filters by action", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20, {
      action: "portal.posting.approve",
    });
    expect(result.logs[0]?.action).toBe("portal.posting.approve");
  });

  it("filters by actorId", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20, { actorId: "admin-1" });
    expect(result.logs[0]?.actorId).toBe("admin-1");
  });

  it("filters by targetType", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20, {
      targetType: "portal_job_posting",
    });
    expect(result.logs[0]?.targetType).toBe("portal_job_posting");
  });

  it("filters by dateFrom and dateTo", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20, {
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
    expect(result.logs).toHaveLength(1);
  });

  it("applies combined filters", async () => {
    makeSelectChain([samplePortalRow], 1);
    const result = await listPortalAdminAuditLogs(1, 20, {
      action: "portal.posting.approve",
      actorId: "admin-1",
      targetType: "portal_job_posting",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
    expect(result.logs).toHaveLength(1);
  });

  it("calculates totalPages correctly", async () => {
    makeSelectChain([], 45);
    const result = await listPortalAdminAuditLogs(1, 20);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
  });

  it("handles pagination (page 2)", async () => {
    makeSelectChain([sampleRow2], 30);
    const result = await listPortalAdminAuditLogs(2, 10);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3);
  });

  it("returns empty results when count is 0", async () => {
    makeSelectChain([], 0);
    const result = await listPortalAdminAuditLogs(1, 20);
    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

describe("listPortalAdminAuditLogsForExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all matching rows without pagination", async () => {
    makeExportSelectChain([samplePortalRow, sampleRow2]);
    const result = await listPortalAdminAuditLogsForExport();
    expect(result).toHaveLength(2);
  });

  it("applies filters to export", async () => {
    makeExportSelectChain([samplePortalRow]);
    const result = await listPortalAdminAuditLogsForExport({
      action: "portal.posting.approve",
    });
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no matches", async () => {
    makeExportSelectChain([]);
    const result = await listPortalAdminAuditLogsForExport({
      action: "portal.posting.approve",
    });
    expect(result).toHaveLength(0);
  });
});

describe("getDistinctPortalAuditAdmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unique admin actors with portal audit entries", async () => {
    makeDistinctChain([
      { id: "admin-1", name: "Admin User" },
      { id: "admin-2", name: "Super Admin" },
    ]);
    const result = await getDistinctPortalAuditAdmins();
    expect(result).toEqual([
      { id: "admin-1", name: "Admin User" },
      { id: "admin-2", name: "Super Admin" },
    ]);
  });

  it("falls back to 'Unknown' when name is null", async () => {
    makeDistinctChain([{ id: "admin-1", name: null }]);
    const result = await getDistinctPortalAuditAdmins();
    expect(result).toEqual([{ id: "admin-1", name: "Unknown" }]);
  });

  it("returns empty array when no portal audit entries exist", async () => {
    makeDistinctChain([]);
    const result = await getDistinctPortalAuditAdmins();
    expect(result).toEqual([]);
  });
});
