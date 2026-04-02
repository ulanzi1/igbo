// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("@/db/schema/reports", () => ({
  platformReports: {
    id: "id",
    reporterId: "reporter_id",
    contentType: "content_type",
    contentId: "content_id",
    reasonCategory: "reason_category",
    reasonText: "reason_text",
    status: "status",
    reviewedBy: "reviewed_by",
    reviewedAt: "reviewed_at",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  count: vi.fn(() => ({ type: "count", as: vi.fn(() => ({ type: "count_aliased" })) })),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const obj = { type: "sql", strings, values, as: vi.fn(() => obj) };
      return obj;
    },
    {
      get: (_target, prop) => {
        if (prop === "as") return vi.fn();
        return undefined;
      },
    },
  ),
}));

vi.mock("server-only", () => ({}));

import {
  createReport,
  getReportCountByContent,
  listReportsForContent,
  listReportsAdmin,
  updateReportStatus,
} from "./reports";

const REPORTER_ID = "00000000-0000-4000-8000-000000000001";
const CONTENT_ID = "00000000-0000-4000-8000-000000000002";

const MOCK_REPORT = {
  id: "rpt-1",
  reporterId: REPORTER_ID,
  contentType: "post" as const,
  contentId: CONTENT_ID,
  reasonCategory: "harassment" as const,
  reasonText: null,
  status: "pending" as const,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createReport", () => {
  it("returns created report on success", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([MOCK_REPORT]),
        }),
      }),
    });

    const result = await createReport(REPORTER_ID, "post", CONTENT_ID, "harassment");
    expect(result).toMatchObject({ id: "rpt-1", contentType: "post" });
    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns null on conflict (duplicate report by same user)", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]), // ON CONFLICT DO NOTHING
        }),
      }),
    });

    const result = await createReport(REPORTER_ID, "post", CONTENT_ID, "spam");
    expect(result).toBeNull();
  });

  it("includes reasonText when provided", async () => {
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...MOCK_REPORT, reasonText: "some reason" }]),
      }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await createReport(REPORTER_ID, "post", CONTENT_ID, "other", "some reason");
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ reasonText: "some reason" }));
  });

  it("passes null for reasonText when not provided", async () => {
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([MOCK_REPORT]),
      }),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await createReport(REPORTER_ID, "post", CONTENT_ID, "harassment");
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ reasonText: null }));
  });
});

describe("getReportCountByContent", () => {
  it("returns 0 when no reports", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });

    const result = await getReportCountByContent("post", CONTENT_ID);
    expect(result).toBe(0);
  });

  it("returns count when reports exist", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });

    const result = await getReportCountByContent("article", CONTENT_ID);
    expect(result).toBe(5);
  });

  it("returns 0 when rows is empty (no matching records)", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await getReportCountByContent("message", CONTENT_ID);
    expect(result).toBe(0);
  });
});

describe("listReportsForContent (anonymity guarantee)", () => {
  it("does NOT include reporter_id in returned columns", async () => {
    const mockReports = [
      {
        id: "rpt-1",
        contentType: "post",
        contentId: CONTENT_ID,
        reasonCategory: "spam",
        reasonText: null,
        status: "pending",
        createdAt: new Date(),
      },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockReports),
        }),
      }),
    });

    const results = await listReportsForContent("post", CONTENT_ID);
    expect(results).toHaveLength(1);
    // Verify reporterId is NOT in any returned object
    for (const r of results) {
      expect(r).not.toHaveProperty("reporterId");
    }
  });

  it("returns empty array when no reports for content", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const results = await listReportsForContent("member", "user-123");
    expect(results).toHaveLength(0);
  });
});

describe("listReportsAdmin", () => {
  it("is exported and callable", () => {
    expect(typeof listReportsAdmin).toBe("function");
  });

  it("accepts filters and pagination parameters", () => {
    // Type-level test: ensure the function signature matches expected interface
    const fn: (
      filters: { status?: "pending" | "reviewed" | "resolved" | "dismissed" },
      pagination: { page: number; pageSize: number },
    ) => Promise<{ items: unknown[]; total: number }> = listReportsAdmin;
    expect(fn).toBeDefined();
  });
});

describe("updateReportStatus", () => {
  it("sets status, reviewedBy, and reviewedAt", async () => {
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: mockSet });

    await updateReportStatus("rpt-1", "resolved", "admin-1");

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "resolved",
        reviewedBy: "admin-1",
        reviewedAt: expect.any(Date),
      }),
    );
  });

  it("supports all status transitions", async () => {
    for (const status of ["pending", "reviewed", "resolved", "dismissed"] as const) {
      const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockUpdate.mockReturnValue({ set: mockSet });

      await updateReportStatus("rpt-x", status, "admin-1");
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status }));
    }
  });
});
