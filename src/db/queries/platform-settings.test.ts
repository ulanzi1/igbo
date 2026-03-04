// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPlatformSetting } from "./platform-settings";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: mockFrom };
    },
  },
}));

vi.mock("@/db/schema/platform-settings", () => ({
  platformSettings: { key: "key", value: "value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
});

describe("getPlatformSetting", () => {
  it("returns value when key exists and type matches", async () => {
    mockLimit.mockResolvedValue([{ value: 50 }]);

    const result = await getPlatformSetting("group_membership_limit", 40);
    expect(result).toBe(50);
  });

  it("returns fallback when key is missing", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await getPlatformSetting("nonexistent_key", 40);
    expect(result).toBe(40);
  });

  it("returns fallback when value type does not match", async () => {
    mockLimit.mockResolvedValue([{ value: "not a number" }]);

    const result = await getPlatformSetting<number>("group_membership_limit", 40);
    expect(result).toBe(40);
  });

  it("returns string value when type matches", async () => {
    mockLimit.mockResolvedValue([{ value: "hello" }]);

    const result = await getPlatformSetting("some_string_key", "default");
    expect(result).toBe("hello");
  });

  it("returns boolean value when type matches", async () => {
    mockLimit.mockResolvedValue([{ value: true }]);

    const result = await getPlatformSetting("feature_flag", false);
    expect(result).toBe(true);
  });

  it("returns fallback when DB value is null (guards object/null typeof collision)", async () => {
    // typeof null === typeof {} both return "object" — must guard against this
    mockLimit.mockResolvedValue([{ value: null }]);

    const result = await getPlatformSetting("some_key", 40);
    expect(result).toBe(40);
  });
});
