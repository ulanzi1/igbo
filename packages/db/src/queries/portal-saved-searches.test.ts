// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "../index";
import {
  getSavedSearchesByUserId,
  getSavedSearchById,
  countSavedSearchesByUserId,
  insertSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getSavedSearchesForAlerts,
  getInstantAlertSearches,
  batchUpdateLastAlertedAt,
} from "./portal-saved-searches";
import type { PortalSavedSearch } from "./portal-saved-searches";

const SAVED_SEARCH: PortalSavedSearch = {
  id: "ss-1",
  userId: "u-1",
  name: "Lagos Engineers",
  searchParamsJson: { query: "engineer", filters: { location: ["Lagos"] } },
  alertFrequency: "daily",
  lastAlertedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

/**
 * Creates a chainable terminal node that resolves to `items` when awaited,
 * and has `.limit()` and `.orderBy()` that also resolve to `items`.
 * This mirrors how Drizzle query builder chains work.
 */
function makeTerminalNode<T>(items: T[]) {
  return Object.assign(Promise.resolve(items), {
    limit: vi.fn().mockResolvedValue(items),
    orderBy: vi.fn().mockResolvedValue(items),
  });
}

function makeSelectMock<T>(items: T[]) {
  const terminal = makeTerminalNode(items);
  const where = vi.fn().mockReturnValue(terminal);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as unknown as ReturnType<typeof db.select>);
  return { terminal, where, from };
}

function makeInsertMock(returnValue: PortalSavedSearch | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

function makeUpdateMock(returnValue: PortalSavedSearch | undefined) {
  const returning = vi.fn().mockResolvedValue(returnValue ? [returnValue] : []);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
}

function makeDeleteMock(deleted: boolean) {
  const returning = vi.fn().mockResolvedValue(deleted ? [{ id: "ss-1" }] : []);
  const where = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.delete).mockReturnValue({ where } as unknown as ReturnType<typeof db.delete>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSavedSearchesByUserId", () => {
  it("returns searches ordered by created_at DESC", async () => {
    makeSelectMock([SAVED_SEARCH]);
    const result = await getSavedSearchesByUserId("u-1");
    expect(result).toEqual([SAVED_SEARCH]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no searches found", async () => {
    makeSelectMock<PortalSavedSearch>([]);
    const result = await getSavedSearchesByUserId("u-1");
    expect(result).toEqual([]);
  });
});

describe("getSavedSearchById", () => {
  it("returns search when found", async () => {
    makeSelectMock([SAVED_SEARCH]);
    const result = await getSavedSearchById("ss-1");
    expect(result).toEqual(SAVED_SEARCH);
  });

  it("returns null when not found", async () => {
    makeSelectMock<PortalSavedSearch>([]);
    const result = await getSavedSearchById("missing");
    expect(result).toBeNull();
  });
});

describe("countSavedSearchesByUserId", () => {
  it("returns count", async () => {
    makeSelectMock([{ count: 3 }]);
    const result = await countSavedSearchesByUserId("u-1");
    expect(result).toBe(3);
  });

  it("returns 0 when no result row", async () => {
    makeSelectMock<{ count: number }>([]);
    const result = await countSavedSearchesByUserId("u-1");
    expect(result).toBe(0);
  });
});

describe("insertSavedSearch", () => {
  it("inserts and returns the new record", async () => {
    makeInsertMock(SAVED_SEARCH);
    const result = await insertSavedSearch({
      userId: "u-1",
      name: "Lagos Engineers",
      searchParamsJson: { query: "engineer" },
      alertFrequency: "daily",
    });
    expect(result).toEqual(SAVED_SEARCH);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("throws if insert returns empty", async () => {
    makeInsertMock(undefined);
    await expect(
      insertSavedSearch({
        userId: "u-1",
        name: "Test",
        searchParamsJson: {},
        alertFrequency: "daily",
      }),
    ).rejects.toThrow("Insert returned no record");
  });
});

describe("updateSavedSearch", () => {
  it("updates and returns the updated record", async () => {
    const updated = { ...SAVED_SEARCH, name: "Updated Name" };
    makeUpdateMock(updated);
    const result = await updateSavedSearch("ss-1", { name: "Updated Name" });
    expect(result).toEqual(updated);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns null when not found", async () => {
    makeUpdateMock(undefined);
    const result = await updateSavedSearch("missing", { name: "X" });
    expect(result).toBeNull();
  });
});

describe("deleteSavedSearch", () => {
  it("returns true when deleted", async () => {
    makeDeleteMock(true);
    const result = await deleteSavedSearch("ss-1");
    expect(result).toBe(true);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("returns false when not found", async () => {
    makeDeleteMock(false);
    const result = await deleteSavedSearch("missing");
    expect(result).toBe(false);
  });
});

describe("getSavedSearchesForAlerts", () => {
  it("returns searches with non-off frequency", async () => {
    makeSelectMock([SAVED_SEARCH]);
    const result = await getSavedSearchesForAlerts();
    expect(result).toEqual([SAVED_SEARCH]);
  });

  it("returns empty when no alert searches", async () => {
    makeSelectMock<PortalSavedSearch>([]);
    const result = await getSavedSearchesForAlerts();
    expect(result).toEqual([]);
  });
});

describe("getInstantAlertSearches", () => {
  it("returns instant alert searches", async () => {
    const instantSearch = { ...SAVED_SEARCH, alertFrequency: "instant" as const };
    makeSelectMock([instantSearch]);
    const result = await getInstantAlertSearches();
    expect(result).toEqual([instantSearch]);
  });

  it("returns empty when no instant searches", async () => {
    makeSelectMock<PortalSavedSearch>([]);
    const result = await getInstantAlertSearches();
    expect(result).toEqual([]);
  });
});

describe("batchUpdateLastAlertedAt", () => {
  it("does nothing when ids array is empty", async () => {
    await batchUpdateLastAlertedAt([], new Date());
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates last_alerted_at for provided ids", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
    const ts = new Date("2026-01-15");
    await batchUpdateLastAlertedAt(["ss-1", "ss-2"], ts);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lastAlertedAt: ts }));
  });
});
