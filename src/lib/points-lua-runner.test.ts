// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDefineCommand, mockAwardPoints } = vi.hoisted(() => ({
  mockDefineCommand: vi.fn(),
  mockAwardPoints: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ defineCommand: mockDefineCommand, awardPoints: mockAwardPoints }),
}));

import { initPointsLuaCommands, awardPoints } from "./points-lua-runner";
import type { AwardPointsResult } from "./points-lua-runner";
import { POINTS_CONFIG } from "@/config/points";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── initPointsLuaCommands ────────────────────────────────────────────────────

describe("initPointsLuaCommands", () => {
  it("calls defineCommand exactly once with numberOfKeys: 6 (AC 6)", () => {
    const mockRedis = { defineCommand: vi.fn() } as unknown as Parameters<
      typeof initPointsLuaCommands
    >[0];
    initPointsLuaCommands(mockRedis);
    expect(mockRedis.defineCommand).toHaveBeenCalledTimes(1);
    expect(mockRedis.defineCommand).toHaveBeenCalledWith(
      "awardPoints",
      expect.objectContaining({ numberOfKeys: 6 }),
    );
  });

  it("does NOT call defineCommand again if awardPoints already registered (idempotency guard)", () => {
    const alreadyRegistered = {
      awardPoints: vi.fn(), // simulate already registered
      defineCommand: vi.fn(),
    } as unknown as Parameters<typeof initPointsLuaCommands>[0];
    initPointsLuaCommands(alreadyRegistered);
    expect(alreadyRegistered.defineCommand).not.toHaveBeenCalled();
  });
});

// ─── awardPoints ──────────────────────────────────────────────────────────────

const baseInput = {
  idempotencyKey: "reaction:post-1:actor-1",
  actorId: "actor-1",
  earnerUserId: "earner-1",
  contentOwnerId: "author-1",
  amount: 10,
};

describe("awardPoints", () => {
  it("returns parsed AwardPointsResult when awarded=1 (ok branch)", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 100, 150] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(result[0]).toBe(1);
    expect(result[1]).toBe("ok");
    expect(result[2]).toBe(100);
    expect(result[3]).toBe(150);
  });

  it("returns awarded=0 with reason='duplicate'", async () => {
    mockAwardPoints.mockResolvedValue([0, "duplicate", 0, 0] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("duplicate");
  });

  it("returns awarded=0 with reason='self'", async () => {
    mockAwardPoints.mockResolvedValue([0, "self", 0, 0] as AwardPointsResult);

    const result = await awardPoints({ ...baseInput, earnerUserId: "actor-1" });

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("self");
  });

  it("returns awarded=0 with reason='rapid_fire'", async () => {
    mockAwardPoints.mockResolvedValue([0, "rapid_fire", 0, 0] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("rapid_fire");
  });

  it("returns awarded=0 with reason='repeat_pair'", async () => {
    mockAwardPoints.mockResolvedValue([0, "repeat_pair", 0, 0] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("repeat_pair");
  });

  it("returns awarded=0 with reason='daily_cap'", async () => {
    mockAwardPoints.mockResolvedValue([0, "daily_cap", 0, 0] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("daily_cap");
  });

  it("calls awardPoints with correct 6-key KEYS array in exact order", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 10, 10] as AwardPointsResult);

    await awardPoints(baseInput);

    expect(mockAwardPoints).toHaveBeenCalledWith(
      6,
      "points:idempotency:reaction:post-1:actor-1", // KEYS[1]
      "points:rapid:actor-1", // KEYS[2]
      "points:repeat:actor-1:author-1", // KEYS[3]
      "points:daily:earner-1", // KEYS[4] (utcDate appended in Lua)
      "points:leaderboard", // KEYS[5]
      "points:user:earner-1", // KEYS[6]
      "actor-1", // ARGV[1] actorId
      "earner-1", // ARGV[2] earnerUserId
      10, // ARGV[3] amount
      expect.any(Number), // ARGV[4] rapidThreshold
      expect.any(Number), // ARGV[5] rapidWindowSec
      expect.any(Number), // ARGV[6] repeatThreshold
      expect.any(Number), // ARGV[7] repeatWindowSec
      expect.any(Number), // ARGV[8] dailyCap
    );
  });

  it("passes POINTS_CONFIG values as ARGV thresholds", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 10, 10] as AwardPointsResult);

    await awardPoints(baseInput);

    expect(mockAwardPoints).toHaveBeenCalledWith(
      6,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      10,
      POINTS_CONFIG.RAPID_FIRE_THRESHOLD,
      POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC,
      POINTS_CONFIG.REPEAT_PAIR_THRESHOLD,
      POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC,
      POINTS_CONFIG.DAILY_CAP_POINTS,
    );
  });

  it("result[2] (newTotal) is returned as a number", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 250, 300] as AwardPointsResult);

    const result = await awardPoints(baseInput);

    expect(typeof result[2]).toBe("number");
    expect(result[2]).toBe(250);
  });

  it("uses input.dailyCap override when provided, not POINTS_CONFIG.DAILY_CAP_POINTS", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 10, 10] as AwardPointsResult);

    await awardPoints({ ...baseInput, dailyCap: 200 });

    const call = mockAwardPoints.mock.calls[0];
    // ARGV[8] (index 13 in the flat call) is the dailyCap
    const dailyCapArg = call[call.length - 1];
    expect(dailyCapArg).toBe(200);
  });

  it("falls back to POINTS_CONFIG.DAILY_CAP_POINTS when dailyCap is not provided", async () => {
    mockAwardPoints.mockResolvedValue([1, "ok", 10, 10] as AwardPointsResult);

    await awardPoints(baseInput); // no dailyCap field

    const call = mockAwardPoints.mock.calls[0];
    const dailyCapArg = call[call.length - 1];
    expect(dailyCapArg).toBe(POINTS_CONFIG.DAILY_CAP_POINTS);
  });
});
