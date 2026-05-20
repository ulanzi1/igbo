import { describe, it, expect } from "vitest";
import {
  getMatchTier,
  MATCH_TIERS,
  MATCH_SIGNAL_WEIGHTS,
  MATCH_SIGNAL_ORDER,
  type MatchScoreResult,
  type MatchScoreResultV2,
  type MatchSignalsV2,
  type MatchSignalKey,
} from "./match";

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

// ============================================================
// Epic 7 — V2 Scoring Contract Tests
// ============================================================

describe("MATCH_SIGNAL_WEIGHTS", () => {
  it("values sum to exactly 100", () => {
    const sum = Object.values(MATCH_SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("contains exactly 5 signals", () => {
    expect(Object.keys(MATCH_SIGNAL_WEIGHTS)).toHaveLength(5);
  });

  it("all values are positive integers", () => {
    for (const value of Object.values(MATCH_SIGNAL_WEIGHTS)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("MATCH_SIGNAL_ORDER", () => {
  it("covers all weight keys exactly once", () => {
    const weightKeys = Object.keys(MATCH_SIGNAL_WEIGHTS).sort();
    const orderKeys = [...MATCH_SIGNAL_ORDER].sort();
    expect(orderKeys).toEqual(weightKeys);
  });

  it("has no duplicates", () => {
    const unique = new Set(MATCH_SIGNAL_ORDER);
    expect(unique.size).toBe(MATCH_SIGNAL_ORDER.length);
  });

  it("is ordered by weight descending (highest weight first)", () => {
    for (let i = 0; i < MATCH_SIGNAL_ORDER.length - 1; i++) {
      const current = MATCH_SIGNAL_WEIGHTS[MATCH_SIGNAL_ORDER[i]!];
      const next = MATCH_SIGNAL_WEIGHTS[MATCH_SIGNAL_ORDER[i + 1]!];
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });
});

describe("MatchScoreResultV2 type", () => {
  it("is structurally valid with all-numeric signals", () => {
    const result: MatchScoreResultV2 = {
      score: 72,
      tier: "good",
      signals: {
        skills: 0.8,
        location: 0.6,
        experience: 0.7,
        salary: 0.5,
        culturalFit: 0.5,
      },
    };
    expect(result.score).toBe(72);
    expect(result.tier).toBe("good");
    expect(result.signals.skills).toBe(0.8);
  });

  it("signals keys match MatchSignalKey type", () => {
    // This test validates at runtime that the signal keys we use
    // are exactly the keys defined in MATCH_SIGNAL_WEIGHTS
    const signals: MatchSignalsV2 = {
      skills: 1,
      location: 1,
      experience: 1,
      salary: 1,
      culturalFit: 1,
    };
    const signalKeys = Object.keys(signals).sort();
    const weightKeys = Object.keys(MATCH_SIGNAL_WEIGHTS).sort();
    expect(signalKeys).toEqual(weightKeys);
  });

  it("computes correct weighted score from normalized signals", () => {
    const signals: MatchSignalsV2 = {
      skills: 0.8,
      location: 1.0,
      experience: 0.6,
      salary: 0.5,
      culturalFit: 0.5,
    };
    // Expected: 0.8*50 + 1.0*20 + 0.6*15 + 0.5*10 + 0.5*5 = 40+20+9+5+2.5 = 76.5
    const score = (Object.keys(MATCH_SIGNAL_WEIGHTS) as MatchSignalKey[]).reduce(
      (sum, key) => sum + signals[key] * MATCH_SIGNAL_WEIGHTS[key],
      0,
    );
    expect(score).toBeCloseTo(76.5);
  });
});
