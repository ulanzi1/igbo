// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn().mockResolvedValue(1));

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

vi.mock("@/db/schema/moderation", () => ({
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

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: "id", name: "name" },
}));

vi.mock("@/db/schema/reports", () => ({
  platformReports: {
    contentType: "content_type",
    contentId: "content_id",
    reporterId: "reporter_id",
    status: "status",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ del: mockRedisDel }),
}));

vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number; detail?: string }) {
      super(title);
      this.status = status;
    }
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings, values }),
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

/** Subquery builder chain: db.select().from().groupBy().as() */
function makeSubqueryChain() {
  const subqueryRef = { contentType: "content_type", contentId: "content_id", reportCount: 0 };
  return {
    from: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockReturnValue({
        as: vi.fn().mockReturnValue(subqueryRef),
      }),
    }),
  };
}

function makeChain(result: unknown) {
  const leftJoinInner = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([result]),
        }),
      }),
      limit: vi.fn().mockResolvedValue([result]),
    }),
  });
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: leftJoinInner,
        where: vi.fn().mockResolvedValue([result]),
      }),
      where: vi.fn().mockResolvedValue([result]),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Main row query chain with TWO leftJoins (authUsers + report_counts subquery) */
function makeRowChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(rows),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

function makeCountChain(count: number) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count }]),
    }),
  };
}

describe("listFlaggedContent", () => {
  it("returns paginated results with default pending status", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls === 1) return makeSubqueryChain(); // report_counts subquery builder
      if (calls === 2) return makeRowChain([MOCK_ITEM]); // main query (parallel)
      return makeCountChain(1); // count query (parallel)
    });

    const result = await listFlaggedContent({ page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("filters by contentType when provided", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls === 1) return makeSubqueryChain();
      if (calls === 2) return makeRowChain([]);
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
      if (calls === 1) return makeSubqueryChain();
      if (calls === 2) return makeRowChain([MOCK_ITEM]);
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
      if (calls === 1) return makeSubqueryChain(); // report_counts subquery
      // main query: 2 leftJoins, then where, then limit
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([MOCK_ITEM]),
              }),
            }),
          }),
        }),
      };
    });
    const result = await getModerationActionById("action-1");
    expect(result).toMatchObject({ id: "action-1" });
  });

  it("returns null when not found", async () => {
    let calls = 0;
    mockSelect.mockImplementation(() => {
      calls++;
      if (calls === 1) return makeSubqueryChain();
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };
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
    expect(mockRedisDel).toHaveBeenCalledWith("moderation:keywords:active");
  });

  it("throws ApiError 409 on duplicate keyword", async () => {
    const { ApiError } = await import("@/lib/api-error");
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
  it("updates fields and invalidates cache", async () => {
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateModerationKeyword("kw-1", { isActive: false });

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockRedisDel).toHaveBeenCalledWith("moderation:keywords:active");
  });
});

describe("deleteModerationKeyword", () => {
  it("deletes keyword and invalidates cache", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });

    await deleteModerationKeyword("kw-1");

    expect(mockDelete).toHaveBeenCalled();
    expect(mockRedisDel).toHaveBeenCalledWith("moderation:keywords:active");
  });
});
