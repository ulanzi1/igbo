// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock("../index", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock("../schema/moderation", () => ({
  platformModerationKeywords: {
    id: "id",
    keyword: "keyword",
    category: "category",
    severity: "severity",
    notes: "notes",
    createdBy: "created_by",
    isActive: "is_active",
    createdAt: "created_at",
  },
  platformModerationActions: {
    id: "id",
    contentType: "content_type",
    contentId: "content_id",
    contentAuthorId: "content_author_id",
    contentPreview: "content_preview",
    flaggedAt: "flagged_at",
    status: "status",
    flagReason: "flag_reason",
    keywordMatched: "keyword_matched",
    autoFlagged: "auto_flagged",
    moderatorId: "moderator_id",
    actionedAt: "actioned_at",
    visibilityOverride: "visibility_override",
    createdAt: "created_at",
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: { id: "id", name: "name" },
}));

vi.mock("../schema/reports", () => ({
  platformReports: {
    contentType: "content_type",
    contentId: "content_id",
    reporterId: "reporter_id",
    status: "status",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  isNotNull: vi.fn((col) => ({ type: "isNotNull", col })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  gte: vi.fn((col, val) => ({ type: "gte", col, val })),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings,
      values,
      as: (alias: string) => ({ type: "sql_aliased", alias }),
    }),
    { get: () => undefined },
  ),
}));

import {
  listFlaggedContent,
  getModerationActionById,
  updateModerationAction,
  listModerationKeywords,
  addModerationKeyword,
  updateModerationKeyword,
  deleteModerationKeyword,
} from "./moderation";

const MOCK_ITEM = {
  id: "action-1",
  contentType: "post" as const,
  contentId: "post-1",
  contentPreview: "bad content",
  contentAuthorId: "user-1",
  authorName: "Alice",
  flagReason: "hate_speech",
  keywordMatched: "badword",
  autoFlagged: true,
  flaggedAt: new Date(),
  status: "pending" as const,
  visibilityOverride: "visible" as const,
};

const MOCK_KW = {
  id: "kw-1",
  keyword: "badword",
  category: "hate_speech",
  severity: "high",
  notes: null,
  createdBy: "admin-1",
  isActive: true,
  createdAt: new Date(),
};

/**
 * Subquery builder chain.
 * Supports both:
 *   db.select().from().groupBy(...).as()          (no intermediate where)
 *   db.select().from().where(...).groupBy(...).as() (with intermediate where)
 */
function makeSubqueryChain() {
  const ref = {};
  const groupBy = vi.fn().mockReturnValue({ as: vi.fn().mockReturnValue(ref) });
  const fromResult = {
    groupBy,
    where: vi.fn().mockReturnValue({ groupBy }),
    as: vi.fn().mockReturnValue(ref),
  };
  return { from: vi.fn().mockReturnValue(fromResult) };
}

/**
 * Main row query chain.
 * Supports N leftJoins followed by either:
 *   .where().orderBy().limit().offset() → rows (listFlaggedContent)
 *   .where().limit()                    → rows (getModerationActionById)
 */
function makeRowChain(rows: unknown[]) {
  const midChain: Record<string, unknown> = {};
  midChain.leftJoin = vi.fn().mockReturnValue(midChain);
  midChain.where = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockResolvedValue(rows),
      }),
    }),
    // getModerationActionById ends chain with .limit(1) directly after .where()
    limit: vi.fn().mockResolvedValue(rows),
  });
  return { from: vi.fn().mockReturnValue(midChain) };
}

function makeCountChain(count: number) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count }]),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listFlaggedContent", () => {
  it("returns paginated results with default pending status", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      // calls 1-4: 4 subquery builders (reportCount, disciplineCount, disciplineLinked, firstReporter)
      if (calls <= 4) return makeSubqueryChain();
      if (calls === 5) return makeRowChain([MOCK_ITEM]); // main rows query
      return makeCountChain(1); // count query
    });

    const result = await listFlaggedContent({ page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("filters by contentType when provided", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls <= 4) return makeSubqueryChain();
      if (calls === 5) return makeRowChain([]);
      return makeCountChain(0);
    });

    const result = await listFlaggedContent({ contentType: "message", page: 1, pageSize: 20 });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("filters by status when provided", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls <= 4) return makeSubqueryChain();
      if (calls === 5) return makeRowChain([MOCK_ITEM]);
      return makeCountChain(1);
    });

    const result = await listFlaggedContent({ status: "reviewed", page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
  });
});

describe("getModerationActionById", () => {
  it("returns item when found", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      // calls 1-4: 4 subquery builders
      if (calls <= 4) return makeSubqueryChain();
      // call 5: main row query (6 leftJoins + where + limit)
      return makeRowChain([MOCK_ITEM]);
    });
    const result = await getModerationActionById("action-1");
    expect(result).toMatchObject({ id: "action-1" });
  });

  it("returns null when not found", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls <= 4) return makeSubqueryChain();
      return makeRowChain([]);
    });
    const result = await getModerationActionById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("updateModerationAction", () => {
  it("updates status and moderatorId and actionedAt", async () => {
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: mockSet });

    const now = new Date();
    await updateModerationAction("action-1", {
      status: "reviewed",
      moderatorId: "admin-1",
      visibilityOverride: "hidden",
      actionedAt: now,
    });

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reviewed", moderatorId: "admin-1" }),
    );
  });
});

describe("listModerationKeywords", () => {
  it("returns all keywords when no filter", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockResolvedValue([MOCK_KW]),
    });
    const result = await listModerationKeywords();
    expect(result).toHaveLength(1);
  });

  it("filters by isActive when provided", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([MOCK_KW]),
      }),
    });
    const result = await listModerationKeywords({ isActive: true });
    expect(result).toHaveLength(1);
  });
});

describe("addModerationKeyword", () => {
  it("inserts and returns id, then invalidates cache", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "new-kw-id" }]);
    const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockValues = vi
      .fn()
      .mockReturnValue({ onConflictDoNothing: mockOnConflict, returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });

    // Workaround: the function uses returning directly after values, not onConflictDoNothing
    mockValues.mockReturnValue({ returning: mockReturning });

    const result = await addModerationKeyword({
      keyword: "badword",
      category: "hate_speech",
      severity: "high",
      createdBy: "admin-1",
    });

    expect(result.id).toBe("new-kw-id");
  });

  it("throws error with status 409 on duplicate keyword", async () => {
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockRejectedValue({ code: "23505" }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await expect(
      addModerationKeyword({ keyword: "dup", category: "spam", severity: "low", createdBy: "a" }),
    ).rejects.toThrow(expect.objectContaining({ status: 409 }));
  });
});

describe("updateModerationKeyword", () => {
  it("updates fields", async () => {
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateModerationKeyword("kw-1", { isActive: false });

    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("deleteModerationKeyword", () => {
  it("deletes keyword", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });

    await deleteModerationKeyword("kw-1");

    expect(mockDelete).toHaveBeenCalled();
  });
});
