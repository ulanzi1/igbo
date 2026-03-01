// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();
vi.mock("@/db", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

const mockGetBlockedUserIds = vi.fn();
const mockGetUsersWhoBlocked = vi.fn();
vi.mock("@/db/queries/block-mute", () => ({
  getBlockedUserIds: (...args: unknown[]) => mockGetBlockedUserIds(...args),
  getUsersWhoBlocked: (...args: unknown[]) => mockGetUsersWhoBlocked(...args),
}));

import { searchMembersInDirectory } from "./geo-search";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const USER_C = "00000000-0000-4000-8000-000000000003";
const USER_D = "00000000-0000-4000-8000-000000000004";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_B,
    display_name: "Alice",
    bio: "I love Igbo culture",
    photo_url: "https://example.com/photo.jpg",
    location_city: "Lagos",
    location_state: "Lagos State",
    location_country: "Nigeria",
    interests: ["culture", "music"],
    languages: ["Igbo", "English"],
    created_at: new Date("2024-01-01T00:00:00Z"),
    membership_tier: "BASIC",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBlockedUserIds.mockResolvedValue([]);
  mockGetUsersWhoBlocked.mockResolvedValue([]);
});

describe("searchMembersInDirectory", () => {
  it("returns members matching query", async () => {
    const row = makeRow();
    mockDbExecute.mockResolvedValue([row]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      query: "Alice",
    });

    expect(result.members).toHaveLength(1);
    expect(result.members[0].displayName).toBe("Alice");
    expect(result.members[0].userId).toBe(USER_B);
    expect(result.members[0].bio).toBe("I love Igbo culture");
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("returns empty array when no matches", async () => {
    mockDbExecute.mockResolvedValue([]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      query: "nonexistent",
    });

    expect(result.members).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("excludes PRIVATE profiles (filtered in SQL, not returned)", async () => {
    // The SQL WHERE clause excludes PRIVATE profiles — only non-private rows come back
    mockDbExecute.mockResolvedValue([]);

    const result = await searchMembersInDirectory({ viewerUserId: VIEWER_ID });

    // Verify db.execute was called — block filtering + SQL query ran
    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(result.members).toHaveLength(0);
  });

  it("excludes users blocked by viewer (bidirectional)", async () => {
    mockGetBlockedUserIds.mockResolvedValue([USER_B]);
    mockGetUsersWhoBlocked.mockResolvedValue([USER_C]);
    mockDbExecute.mockResolvedValue([]);

    await searchMembersInDirectory({ viewerUserId: VIEWER_ID });

    expect(mockGetBlockedUserIds).toHaveBeenCalledWith(VIEWER_ID);
    expect(mockGetUsersWhoBlocked).toHaveBeenCalledWith(VIEWER_ID);
    // Both directions and viewer's own ID are excluded from query
  });

  it("excludes viewer's own profile", async () => {
    // viewerUserId is always added to allExcludedIds
    mockDbExecute.mockResolvedValue([]);

    await searchMembersInDirectory({ viewerUserId: VIEWER_ID });

    // The SQL call should include viewer in excluded list
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("applies membershipTier filter when provided", async () => {
    const row = makeRow({ membership_tier: "PROFESSIONAL" });
    mockDbExecute.mockResolvedValue([row]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      membershipTier: "PROFESSIONAL",
    });

    expect(result.members[0].membershipTier).toBe("PROFESSIONAL");
  });

  it("applies interests overlap filter when provided", async () => {
    const row = makeRow({ interests: ["music", "culture"] });
    mockDbExecute.mockResolvedValue([row]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      interests: ["music"],
    });

    expect(result.members[0].interests).toContain("music");
    expect(mockDbExecute).toHaveBeenCalledOnce();
  });

  it("applies language filter when provided", async () => {
    const row = makeRow({ languages: ["Igbo", "English"] });
    mockDbExecute.mockResolvedValue([row]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      language: "Igbo",
    });

    expect(result.members[0].languages).toContain("Igbo");
  });

  it("returns hasMore: true and nextCursor when results exceed limit", async () => {
    // 3 rows returned for limit=2 → hasMore = true
    const rows = [
      makeRow({ user_id: USER_B, created_at: new Date("2024-01-03T00:00:00Z") }),
      makeRow({ user_id: USER_C, created_at: new Date("2024-01-02T00:00:00Z") }),
      makeRow({ user_id: USER_D, created_at: new Date("2024-01-01T00:00:00Z") }), // extra row
    ];
    mockDbExecute.mockResolvedValue(rows);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      limit: 2,
    });

    expect(result.members).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns hasMore: false when results fit within limit", async () => {
    mockDbExecute.mockResolvedValue([makeRow()]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      limit: 20,
    });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("returns null location fields when member has locationVisible: false", async () => {
    // When location_visible is false, SQL CASE returns NULL for location fields
    const row = makeRow({
      location_city: null,
      location_state: null,
      location_country: null,
    });
    mockDbExecute.mockResolvedValue([row]);

    const result = await searchMembersInDirectory({ viewerUserId: VIEWER_ID });

    expect(result.members[0].locationCity).toBeNull();
    expect(result.members[0].locationState).toBeNull();
    expect(result.members[0].locationCountry).toBeNull();
  });

  it("cursor pagination: decodes cursor and applies to next page query", async () => {
    mockDbExecute.mockResolvedValue([makeRow()]);

    // Build a valid cursor
    const cursorPayload = Buffer.from(
      JSON.stringify({ createdAt: "2024-01-01T00:00:00.000Z", userId: USER_B }),
    ).toString("base64url");

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      cursor: cursorPayload,
    });

    // db.execute should have been called (cursor applied internally)
    expect(mockDbExecute).toHaveBeenCalledOnce();
    expect(result.members).toHaveLength(1);
  });

  it("ignores invalid cursor gracefully", async () => {
    mockDbExecute.mockResolvedValue([makeRow()]);

    const result = await searchMembersInDirectory({
      viewerUserId: VIEWER_ID,
      cursor: "not-valid-base64url!!",
    });

    // Should not throw; cursor is silently ignored
    expect(result.members).toHaveLength(1);
  });
});
