// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../index", () => ({ db: { insert: vi.fn(), select: vi.fn() } }));

import { db } from "../index";
import { createApplicationNote, getNotesByApplicationId } from "./portal-application-notes";

const NOTE_ROW = {
  id: "note-1",
  applicationId: "app-1",
  authorUserId: "user-1",
  content: "Strong candidate — schedule interview",
  createdAt: new Date("2026-04-11T10:00:00Z"),
};

function makeInsertMock(returnValue: unknown) {
  const returning = vi.fn().mockResolvedValue([returnValue]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

/** Mock chain for `select().from().where().limit()` — returns `returnValues`. */
function makeAuthorLookupMock(returnValues: unknown[]) {
  const limit = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({
    from,
  } as unknown as ReturnType<typeof db.select>);
}

/** Mock chain for `select().from().leftJoin().where().orderBy()` — returns `returnValues`. */
function makeSelectWithJoinOrderMock(returnValues: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(returnValues);
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  vi.mocked(db.select).mockReturnValue({
    from,
  } as unknown as ReturnType<typeof db.select>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createApplicationNote", () => {
  it("inserts note and returns enriched row with authorName", async () => {
    makeInsertMock(NOTE_ROW);
    makeAuthorLookupMock([{ name: "Jane Employer" }]);

    const result = await createApplicationNote({
      applicationId: "app-1",
      authorUserId: "user-1",
      content: "Strong candidate — schedule interview",
    });

    expect(result).toEqual({
      id: "note-1",
      applicationId: "app-1",
      authorUserId: "user-1",
      authorName: "Jane Employer",
      content: "Strong candidate — schedule interview",
      createdAt: NOTE_ROW.createdAt,
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("returns authorName null when author lookup returns no row", async () => {
    makeInsertMock(NOTE_ROW);
    makeAuthorLookupMock([]);

    const result = await createApplicationNote({
      applicationId: "app-1",
      authorUserId: "user-1",
      content: "Text",
    });

    expect(result.authorName).toBeNull();
  });

  it("throws if insert returns empty", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({
      values,
    } as unknown as ReturnType<typeof db.insert>);

    await expect(
      createApplicationNote({
        applicationId: "app-1",
        authorUserId: "user-1",
        content: "Text",
      }),
    ).rejects.toThrow("createApplicationNote: no row returned");
  });
});

describe("getNotesByApplicationId", () => {
  it("returns notes in chronological order with author name", async () => {
    const row1 = {
      id: "note-1",
      applicationId: "app-1",
      authorUserId: "user-1",
      authorName: "Jane",
      content: "First note",
      createdAt: new Date("2026-04-11T10:00:00Z"),
    };
    const row2 = {
      id: "note-2",
      applicationId: "app-1",
      authorUserId: "user-2",
      authorName: "Bob",
      content: "Second note",
      createdAt: new Date("2026-04-11T11:00:00Z"),
    };
    makeSelectWithJoinOrderMock([row1, row2]);

    const result = await getNotesByApplicationId("app-1");

    expect(result).toHaveLength(2);
    expect(result[0]?.content).toBe("First note");
    expect(result[0]?.authorName).toBe("Jane");
    expect(result[1]?.content).toBe("Second note");
  });

  it("coerces missing authorName to null", async () => {
    const row = {
      id: "note-1",
      applicationId: "app-1",
      authorUserId: "user-1",
      authorName: null,
      content: "Text",
      createdAt: new Date(),
    };
    makeSelectWithJoinOrderMock([row]);

    const result = await getNotesByApplicationId("app-1");

    expect(result[0]?.authorName).toBeNull();
  });

  it("returns empty array when no notes exist", async () => {
    makeSelectWithJoinOrderMock([]);

    const result = await getNotesByApplicationId("app-no-notes");

    expect(result).toEqual([]);
  });
});
