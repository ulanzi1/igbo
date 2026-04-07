// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

function createSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(Promise.resolve(result));
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../schema/portal-screening-keywords", () => ({
  portalScreeningKeywords: {
    id: "id_col",
    phrase: "phrase_col",
    category: "category_col",
    severity: "severity_col",
    notes: "notes_col",
    createdByAdminId: "created_by_admin_id_col",
    createdAt: "created_at_col",
    updatedAt: "updated_at_col",
    deletedAt: "deleted_at_col",
  },
}));

import { db } from "../index";
import {
  listScreeningKeywords,
  getScreeningKeywordById,
  insertScreeningKeyword,
  updateScreeningKeyword,
  softDeleteScreeningKeyword,
  getActiveBlocklistPhrases,
} from "./portal-screening-keywords";

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const fakeKeyword = {
  id: "kw-1",
  phrase: "must be male",
  category: "discriminatory",
  severity: "high",
  notes: null,
  createdByAdminId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listScreeningKeywords", () => {
  it("returns items and total", async () => {
    const items = [fakeKeyword];
    const countRow = [{ total: 1 }];

    const itemChain = createSelectChain(items);
    const countChain = createSelectChain(countRow);

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? itemChain : countChain;
    });

    const result = await listScreeningKeywords({ limit: 10, offset: 0 });
    expect(result.items).toEqual(items);
    expect(result.total).toBe(1);
  });

  it("returns total 0 when count row missing", async () => {
    const itemChain = createSelectChain([]);
    const countChain = createSelectChain([]);
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? itemChain : countChain;
    });
    const result = await listScreeningKeywords();
    expect(result.total).toBe(0);
  });
});

describe("getScreeningKeywordById", () => {
  it("returns keyword when found", async () => {
    const chain = createSelectChain([fakeKeyword]);
    mockDb.select.mockReturnValue(chain);
    const result = await getScreeningKeywordById("kw-1");
    expect(result).toEqual(fakeKeyword);
  });

  it("returns null when not found", async () => {
    const chain = createSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getScreeningKeywordById("missing");
    expect(result).toBeNull();
  });
});

describe("insertScreeningKeyword", () => {
  it("returns inserted keyword", async () => {
    const insertChain: Record<string, unknown> = {};
    insertChain.values = vi.fn().mockReturnValue(insertChain);
    insertChain.returning = vi.fn().mockResolvedValue([fakeKeyword]);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await insertScreeningKeyword({
      phrase: "must be male",
      category: "discriminatory",
      severity: "high",
    });
    expect(result).toEqual(fakeKeyword);
  });

  it("throws when no row returned", async () => {
    const insertChain: Record<string, unknown> = {};
    insertChain.values = vi.fn().mockReturnValue(insertChain);
    insertChain.returning = vi.fn().mockResolvedValue([]);
    mockDb.insert.mockReturnValue(insertChain);

    await expect(
      insertScreeningKeyword({ phrase: "x", category: "other", severity: "high" }),
    ).rejects.toThrow("insertScreeningKeyword: no row returned");
  });
});

describe("updateScreeningKeyword", () => {
  it("returns updated keyword", async () => {
    const updated = { ...fakeKeyword, phrase: "updated phrase" };
    const updateChain: Record<string, unknown> = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([updated]);
    mockDb.update.mockReturnValue(updateChain);

    const result = await updateScreeningKeyword("kw-1", { phrase: "updated phrase" });
    expect(result).toEqual(updated);
  });

  it("returns null when keyword not found", async () => {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([]);
    mockDb.update.mockReturnValue(updateChain);

    const result = await updateScreeningKeyword("missing", { phrase: "x" });
    expect(result).toBeNull();
  });
});

describe("softDeleteScreeningKeyword", () => {
  it("returns true when deleted", async () => {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([{ id: "kw-1" }]);
    mockDb.update.mockReturnValue(updateChain);

    const result = await softDeleteScreeningKeyword("kw-1");
    expect(result).toBe(true);
  });

  it("returns false when not found", async () => {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([]);
    mockDb.update.mockReturnValue(updateChain);

    const result = await softDeleteScreeningKeyword("missing");
    expect(result).toBe(false);
  });
});

describe("getActiveBlocklistPhrases", () => {
  it("returns lowercased phrases", async () => {
    const chain = createSelectChain([{ phrase: "Must Be Male" }, { phrase: "CRYPTO INVESTMENT" }]);
    mockDb.select.mockReturnValue(chain);

    const result = await getActiveBlocklistPhrases();
    expect(result).toEqual(["must be male", "crypto investment"]);
  });

  it("returns empty array when no phrases", async () => {
    const chain = createSelectChain([]);
    mockDb.select.mockReturnValue(chain);

    const result = await getActiveBlocklistPhrases();
    expect(result).toEqual([]);
  });
});
