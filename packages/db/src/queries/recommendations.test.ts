// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();
const mockInsert = vi.fn();

vi.mock("../index", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("../schema/platform-dismissed-recommendations", () => ({
  platformDismissedGroupRecommendations: { name: "platform_dismissed_group_recommendations" },
}));

import { getRecommendedGroups, dismissGroupRecommendation } from "./recommendations";

const GROUP_ID = "00000000-0000-4000-8000-000000000010";
const USER_ID = "00000000-0000-4000-8000-000000000001";

const makeRow = (overrides = {}) => ({
  id: GROUP_ID,
  name: "Igbo Heritage",
  description: "A cultural group",
  banner_url: null,
  visibility: "public",
  join_type: "open",
  member_count: "10",
  score: "3",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecommendedGroups", () => {
  it("returns mapped results from raw rows", async () => {
    mockExecute.mockResolvedValue([makeRow()]);
    const result = await getRecommendedGroups(USER_ID, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: GROUP_ID,
      name: "Igbo Heritage",
      visibility: "public",
      joinType: "open",
      memberCount: 10,
      score: 3,
    });
  });

  it("returns empty array when no rows", async () => {
    mockExecute.mockResolvedValue([]);
    const result = await getRecommendedGroups(USER_ID, 5);
    expect(result).toHaveLength(0);
  });

  it("respects limit argument", async () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" }), makeRow({ id: "c" })];
    mockExecute.mockResolvedValue(rows);
    const result = await getRecommendedGroups(USER_ID, 3);
    expect(result).toHaveLength(3);
  });

  it("handles null description and bannerUrl", async () => {
    mockExecute.mockResolvedValue([makeRow({ description: null, banner_url: null })]);
    const result = await getRecommendedGroups(USER_ID);
    expect(result[0]?.description).toBeNull();
    expect(result[0]?.bannerUrl).toBeNull();
  });

  it("converts numeric strings to numbers", async () => {
    mockExecute.mockResolvedValue([makeRow({ member_count: "42", score: "2" })]);
    const [item] = await getRecommendedGroups(USER_ID);
    expect(item?.memberCount).toBe(42);
    expect(item?.score).toBe(2);
  });
});

describe("dismissGroupRecommendation", () => {
  it("inserts a row with onConflictDoNothing", async () => {
    const mockValues = vi
      .fn()
      .mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    mockInsert.mockReturnValue({ values: mockValues });

    await dismissGroupRecommendation(USER_ID, GROUP_ID);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({ userId: USER_ID, groupId: GROUP_ID });
  });

  it("is idempotent (onConflictDoNothing prevents error on second call)", async () => {
    const mockValues = vi
      .fn()
      .mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    mockInsert.mockReturnValue({ values: mockValues });

    await expect(dismissGroupRecommendation(USER_ID, GROUP_ID)).resolves.toBeUndefined();
    await expect(dismissGroupRecommendation(USER_ID, GROUP_ID)).resolves.toBeUndefined();
  });
});
