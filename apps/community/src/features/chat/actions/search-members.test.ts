// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSearchMembersByName = vi.fn();
vi.mock("@igbo/db/queries/community-profiles", () => ({
  searchMembersByName: (...args: unknown[]) => mockSearchMembersByName(...args),
}));

import { searchMembers } from "./search-members";

const MOCK_RESULTS = [
  { id: "user-2", displayName: "Ada Okonkwo", photoUrl: null },
  { id: "user-3", displayName: "Chidi Okeke", photoUrl: "/photos/chidi.jpg" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchMembersByName.mockResolvedValue(MOCK_RESULTS);
});

describe("searchMembers", () => {
  it("returns empty array when query is too short (< 2 chars)", async () => {
    const result = await searchMembers("A", []);
    expect(result).toEqual([]);
    expect(mockSearchMembersByName).not.toHaveBeenCalled();
  });

  it("returns empty array when query is empty", async () => {
    const result = await searchMembers("", []);
    expect(result).toEqual([]);
    expect(mockSearchMembersByName).not.toHaveBeenCalled();
  });

  it("calls searchMembersByName with trimmed query and exclusions", async () => {
    const excludeIds = ["user-1", "user-5"];
    await searchMembers("  Ada  ", excludeIds);

    expect(mockSearchMembersByName).toHaveBeenCalledOnce();
    expect(mockSearchMembersByName).toHaveBeenCalledWith("Ada", excludeIds, 10);
  });

  it("returns results from searchMembersByName", async () => {
    const result = await searchMembers("Ada", []);

    expect(result).toEqual(MOCK_RESULTS);
    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe("Ada Okonkwo");
  });

  it("returns empty array on error (catch block)", async () => {
    mockSearchMembersByName.mockRejectedValue(new Error("DB connection failed"));

    const result = await searchMembers("Ada", []);

    expect(result).toEqual([]);
    expect(mockSearchMembersByName).toHaveBeenCalledOnce();
  });
});
