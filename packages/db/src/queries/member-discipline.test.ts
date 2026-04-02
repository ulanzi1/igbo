// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDisciplineTable = vi.hoisted(() => ({
  id: "id",
  userId: "user_id",
  moderationActionId: "moderation_action_id",
  sourceType: "source_type",
  actionType: "action_type",
  reason: "reason",
  notes: "notes",
  suspensionEndsAt: "suspension_ends_at",
  issuedBy: "issued_by",
  status: "status",
  liftedAt: "lifted_at",
  liftedBy: "lifted_by",
  createdAt: "created_at",
}));

vi.mock("../index", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("../schema/member-discipline", () => ({
  memberDisciplineActions: mockDisciplineTable,
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, name: string) => ({
    _alias: name,
    id: `${name}.id`,
    name: `${name}.name`,
  })),
}));

import {
  createDisciplineAction,
  getDisciplineActionById,
  listMemberDisciplineHistory,
  getActiveSuspension,
  expireDisciplineAction,
  listSuspensionsExpiringBefore,
} from "./member-discipline";

const buildInsertChain = (returnRows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returnRows);
  const values = vi.fn().mockReturnValue({ returning });
  mockInsert.mockReturnValue({ values });
  return { values, returning };
};

const buildSelectChain = (returnRows: unknown[]) => {
  const limit = vi.fn().mockResolvedValue(returnRows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where, orderBy });
  mockSelect.mockReturnValue({ from });
  return { from, where, orderBy, limit };
};

const buildUpdateChain = () => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockUpdate.mockReturnValue({ set });
  return { set, where };
};

describe("createDisciplineAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and returns id", async () => {
    buildInsertChain([{ id: "disc-1" }]);
    const result = await createDisciplineAction({
      userId: "user-1",
      sourceType: "moderation_action",
      actionType: "warning",
      reason: "Violated guidelines",
      issuedBy: "admin-1",
    });
    expect(result).toEqual({ id: "disc-1" });
    expect(mockInsert).toHaveBeenCalledWith(mockDisciplineTable);
  });

  it("throws if insert returns no id", async () => {
    buildInsertChain([]);
    await expect(
      createDisciplineAction({
        userId: "user-1",
        sourceType: "manual",
        actionType: "ban",
        reason: "Severe violation",
        issuedBy: "admin-1",
      }),
    ).rejects.toThrow("Insert returned no id");
  });

  it("passes optional fields through", async () => {
    const endsAt = new Date("2026-04-01T00:00:00Z");
    buildInsertChain([{ id: "disc-2" }]);
    const result = await createDisciplineAction({
      userId: "user-2",
      moderationActionId: "mod-1",
      sourceType: "moderation_action",
      actionType: "suspension",
      reason: "Spam",
      notes: "Admin note",
      suspensionEndsAt: endsAt,
      issuedBy: "admin-1",
    });
    expect(result.id).toBe("disc-2");
  });
});

describe("getDisciplineActionById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns discipline action when found", async () => {
    const action = { id: "disc-1", actionType: "suspension", status: "active" };
    buildSelectChain([action]);
    const result = await getDisciplineActionById("disc-1");
    expect(result).toEqual(action);
  });

  it("returns null when not found", async () => {
    buildSelectChain([]);
    const result = await getDisciplineActionById("disc-nonexistent");
    expect(result).toBeNull();
  });
});

describe("listMemberDisciplineHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns discipline records ordered by createdAt desc", async () => {
    const records = [
      {
        id: "d1",
        actionType: "ban",
        createdAt: new Date(),
        issuedByName: "Admin",
        liftedByName: null,
      },
      {
        id: "d2",
        actionType: "warning",
        createdAt: new Date("2026-01-01"),
        issuedByName: "Admin",
        liftedByName: null,
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(records);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi
      .fn()
      .mockReturnValue({ leftJoin: vi.fn().mockReturnValue({ where }), where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    mockSelect.mockReturnValue({ from });

    const result = await listMemberDisciplineHistory("user-1");
    expect(result).toEqual(records);
    expect(from).toHaveBeenCalledWith(mockDisciplineTable);
  });
});

describe("getActiveSuspension", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active suspension row when found", async () => {
    const suspension = { id: "d1", actionType: "suspension", status: "active" };
    buildSelectChain([suspension]);
    const result = await getActiveSuspension("user-1");
    expect(result).toEqual(suspension);
  });

  it("returns null when no active suspension", async () => {
    buildSelectChain([]);
    const result = await getActiveSuspension("user-1");
    expect(result).toBeNull();
  });
});

describe("expireDisciplineAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets status to expired when no liftedBy", async () => {
    const { set, where } = buildUpdateChain();
    await expireDisciplineAction("disc-1");
    expect(mockUpdate).toHaveBeenCalledWith(mockDisciplineTable);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(where).toHaveBeenCalled();
  });

  it("sets status to lifted when liftedBy provided", async () => {
    const { set } = buildUpdateChain();
    await expireDisciplineAction("disc-1", "admin-1");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "lifted", liftedBy: "admin-1" }),
    );
  });
});

describe("listSuspensionsExpiringBefore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns suspensions expiring before the given date", async () => {
    const expiredSuspension = {
      id: "d1",
      actionType: "suspension",
      status: "active",
      suspensionEndsAt: new Date("2026-01-01"),
    };
    const where = vi.fn().mockResolvedValue([expiredSuspension]);
    const from = vi.fn().mockReturnValue({ where });
    mockSelect.mockReturnValue({ from });

    const now = new Date("2026-03-09");
    const result = await listSuspensionsExpiringBefore(now);
    expect(result).toEqual([expiredSuspension]);
    expect(from).toHaveBeenCalledWith(mockDisciplineTable);
  });
});
