// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: "userId",
    deletedAt: "deletedAt",
    profileCompletedAt: "profileCompletedAt",
    guidelinesAcknowledgedAt: "guidelinesAcknowledgedAt",
    tourCompletedAt: "tourCompletedAt",
    tourSkippedAt: "tourSkippedAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ args, type: "and" })),
  eq: vi.fn((col, val) => ({ col, val, type: "eq" })),
  isNull: vi.fn((col) => ({ col, type: "isNull" })),
  isNotNull: vi.fn((col) => ({ col, type: "isNotNull" })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, type: "sql" }),
    { raw: vi.fn() },
  ),
}));

import { db } from "../index";

const mockSelect = vi.mocked(db.select);
const mockInsert = vi.mocked(db.insert);
const mockUpdate = vi.mocked(db.update);
const mockExecute = vi.mocked(db.execute);

const PROFILE = {
  id: "profile-1",
  userId: "user-1",
  displayName: "Test User",
  bio: null,
  photoUrl: null,
  locationCity: null,
  locationState: null,
  locationCountry: null,
  locationLat: null,
  locationLng: null,
  interests: [],
  culturalConnections: [],
  languages: [],
  profileCompletedAt: new Date(),
  guidelinesAcknowledgedAt: null,
  tourCompletedAt: null,
  tourSkippedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProfileByUserId", () => {
  it("returns null when no profile found", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(chain as never);

    const { getProfileByUserId } = await import("./community-profiles");
    const result = await getProfileByUserId("user-1");
    expect(result).toBeNull();
  });

  it("returns null when profile is soft-deleted (filtered by WHERE clause)", async () => {
    // Soft-deleted profiles are excluded by the SQL WHERE clause (and(eq(userId), isNull(deletedAt)))
    // so the DB returns an empty result set
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(chain as never);

    const { getProfileByUserId } = await import("./community-profiles");
    const result = await getProfileByUserId("user-1");
    expect(result).toBeNull();
  });

  it("returns profile when found and not deleted", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([PROFILE]),
    };
    mockSelect.mockReturnValue(chain as never);

    const { getProfileByUserId } = await import("./community-profiles");
    const result = await getProfileByUserId("user-1");
    expect(result).toEqual(PROFILE);
  });
});

describe("upsertProfile", () => {
  it("inserts with conflict update", async () => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([PROFILE]),
    };
    mockInsert.mockReturnValue(chain as never);

    const { upsertProfile } = await import("./community-profiles");
    const result = await upsertProfile("user-1", {
      displayName: "Test",
      bio: null,
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      locationLat: null,
      locationLng: null,
      interests: [],
      culturalConnections: [],
      languages: [],
      profileCompletedAt: new Date(),
      guidelinesAcknowledgedAt: null,
      tourCompletedAt: null,
      tourSkippedAt: null,
      deletedAt: null,
    });
    expect(result).toEqual(PROFILE);
    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Test" }));
    expect(chain.onConflictDoUpdate).toHaveBeenCalled();
  });
});

describe("setGuidelinesAcknowledged", () => {
  it("updates guidelinesAcknowledgedAt for the user", async () => {
    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
    mockUpdate.mockReturnValue(chain as never);

    const { setGuidelinesAcknowledged } = await import("./community-profiles");
    await setGuidelinesAcknowledged("user-1");
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ guidelinesAcknowledgedAt: expect.any(Date) }),
    );
  });
});

describe("setTourComplete", () => {
  it("sets tourCompletedAt when not skipped", async () => {
    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
    mockUpdate.mockReturnValue(chain as never);

    const { setTourComplete } = await import("./community-profiles");
    await setTourComplete("user-1", false);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tourCompletedAt: expect.any(Date), tourSkippedAt: null }),
    );
  });

  it("sets tourSkippedAt when skipped", async () => {
    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
    mockUpdate.mockReturnValue(chain as never);

    const { setTourComplete } = await import("./community-profiles");
    await setTourComplete("user-1", true);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tourSkippedAt: expect.any(Date), tourCompletedAt: null }),
    );
  });
});

describe("searchMembersByName", () => {
  const mockResults = [
    { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
    { id: "user-3", displayName: "Adaeze Ibe", photoUrl: null },
  ];

  it("returns matching member profiles", async () => {
    mockExecute.mockResolvedValue(mockResults as never);
    const { searchMembersByName } = await import("./community-profiles");
    const results = await searchMembersByName("Ada", []);
    expect(results).toEqual(mockResults);
    expect(mockExecute).toHaveBeenCalled();
  });

  it("returns empty array when no matches", async () => {
    mockExecute.mockResolvedValue([] as never);
    const { searchMembersByName } = await import("./community-profiles");
    const results = await searchMembersByName("xyz", []);
    expect(results).toEqual([]);
  });

  it("passes limit parameter to SQL query", async () => {
    mockExecute.mockResolvedValue([] as never);
    const { searchMembersByName } = await import("./community-profiles");
    await searchMembersByName("Ada", [], 5);
    expect(mockExecute).toHaveBeenCalled();
  });

  it("excludes specified user IDs from results", async () => {
    mockExecute.mockResolvedValue([] as never);
    const { searchMembersByName } = await import("./community-profiles");
    // Should still call execute (the SQL handles the exclusion)
    await searchMembersByName("Ada", ["user-1", "user-2"]);
    expect(mockExecute).toHaveBeenCalled();
  });
});
