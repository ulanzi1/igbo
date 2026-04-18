import { describe, it, expect } from "vitest";
import { getMatchTier, MATCH_TIERS, type MatchScoreResult } from "./match";

describe("getMatchTier", () => {
  it("returns 'none' for score 0", () => {
    expect(getMatchTier(0)).toBe("none");
  });

  it("returns 'none' for score 29 (just below fair threshold)", () => {
    expect(getMatchTier(29)).toBe("none");
  });

  it("returns 'fair' for score 30 (fair threshold boundary)", () => {
    expect(getMatchTier(30)).toBe("fair");
  });

  it("returns 'fair' for score 49 (just below good threshold)", () => {
    expect(getMatchTier(49)).toBe("fair");
  });

  it("returns 'good' for score 50 (good threshold boundary)", () => {
    expect(getMatchTier(50)).toBe("good");
  });

  it("returns 'good' for score 74 (just below strong threshold)", () => {
    expect(getMatchTier(74)).toBe("good");
  });

  it("returns 'strong' for score 75 (strong threshold boundary)", () => {
    expect(getMatchTier(75)).toBe("strong");
  });

  it("returns 'strong' for score 100 (maximum)", () => {
    expect(getMatchTier(100)).toBe("strong");
  });
});

describe("MATCH_TIERS", () => {
  it("STRONG.min is 75", () => {
    expect(MATCH_TIERS.STRONG.min).toBe(75);
  });

  it("GOOD.min is 50", () => {
    expect(MATCH_TIERS.GOOD.min).toBe(50);
  });

  it("FAIR.min is 30", () => {
    expect(MATCH_TIERS.FAIR.min).toBe(30);
  });

  it("NONE.min is 0", () => {
    expect(MATCH_TIERS.NONE.min).toBe(0);
  });
});

describe("MatchScoreResult type", () => {
  it("is importable and structurally valid", () => {
    const result: MatchScoreResult = {
      score: 85,
      tier: "strong",
      signals: {
        skillsOverlap: 60,
        locationMatch: true,
        employmentTypeMatch: true,
      },
    };
    expect(result.score).toBe(85);
    expect(result.tier).toBe("strong");
    expect(result.signals.skillsOverlap).toBe(60);
  });
});
