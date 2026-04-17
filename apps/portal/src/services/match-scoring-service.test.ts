// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeMatchScore } from "./match-scoring-service";

const baseProfile = { skills: ["JavaScript", "React"] };
const basePrefs = { locations: ["Lagos"], workModes: ["remote"] };
const baseJob = {
  requirements: "JavaScript React TypeScript experience required",
  location: "Lagos, Nigeria",
  employmentType: "full_time",
};

// ---------------------------------------------------------------------------
// Skills overlap
// ---------------------------------------------------------------------------

describe("computeMatchScore — skills overlap", () => {
  it("returns 0 skillsOverlap when seeker has no skills", () => {
    const result = computeMatchScore({ skills: [] }, basePrefs, baseJob);
    expect(result.signals.skillsOverlap).toBe(0);
  });

  it("returns 60 skillsOverlap when all skills match", () => {
    const result = computeMatchScore({ skills: ["JavaScript", "React"] }, basePrefs, {
      ...baseJob,
      requirements: "JavaScript React developer",
    });
    expect(result.signals.skillsOverlap).toBe(60);
  });

  it("returns proportional score for partial skill match", () => {
    // 1 out of 2 skills match → 50% of 60 = 30
    const result = computeMatchScore({ skills: ["JavaScript", "Python"] }, basePrefs, {
      ...baseJob,
      requirements: "JavaScript developer wanted",
    });
    expect(result.signals.skillsOverlap).toBe(30);
  });

  it("is case-insensitive for skill matching", () => {
    const result = computeMatchScore({ skills: ["javascript"] }, basePrefs, {
      ...baseJob,
      requirements: "JAVASCRIPT React developer",
    });
    expect(result.signals.skillsOverlap).toBeGreaterThan(0);
  });

  it("returns 0 skillsOverlap when requirements is null", () => {
    const result = computeMatchScore(baseProfile, basePrefs, { ...baseJob, requirements: null });
    expect(result.signals.skillsOverlap).toBe(0);
  });

  it("caps skillsOverlap at 60", () => {
    const result = computeMatchScore({ skills: ["a", "b", "c", "d"] }, basePrefs, {
      ...baseJob,
      requirements: "a b c d e f g",
    });
    expect(result.signals.skillsOverlap).toBeLessThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// Location match
// ---------------------------------------------------------------------------

describe("computeMatchScore — location match", () => {
  it("returns 25 points for exact substring match", () => {
    const result = computeMatchScore(
      baseProfile,
      { locations: ["Lagos"], workModes: [] },
      { ...baseJob, location: "Lagos, Nigeria" },
    );
    // "lagos" is a substring of "lagos, nigeria"
    expect(result.signals.locationMatch).toBe(true);
    // Location portion should be 25
    const noSkillResult = computeMatchScore(
      { skills: [] },
      { locations: ["Lagos"], workModes: [] },
      { requirements: null, location: "Lagos, Nigeria", employmentType: "full_time" },
    );
    expect(noSkillResult.score).toBeGreaterThanOrEqual(25);
  });

  it("returns 0 for no location match", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: ["Toronto"], workModes: [] },
      { requirements: null, location: "Lagos, Nigeria", employmentType: "full_time" },
    );
    expect(result.signals.locationMatch).toBe(false);
  });

  it("returns partial credit (15) for region/country word match", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: ["Abuja, Nigeria"], workModes: [] },
      { requirements: null, location: "Lagos, Nigeria", employmentType: "full_time" },
    );
    // "nigeria" appears in both — location gets 15 (not 25, since "abuja, nigeria" doesn't substring match "lagos, nigeria")
    // Empty workModes → 10 (benefit-of-doubt default) + 15 (location) = 25
    expect(result.signals.locationMatch).toBe(true);
    expect(result.score).toBe(25); // 0 skills + 15 location + 10 employment default = 25
  });

  it("checks multiple seeker locations", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: ["Toronto", "Lagos"], workModes: [] },
      { requirements: null, location: "Lagos, Nigeria", employmentType: "full_time" },
    );
    expect(result.signals.locationMatch).toBe(true);
  });

  it("returns 0 when locations array is empty", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: [] },
      { requirements: null, location: "Lagos, Nigeria", employmentType: "full_time" },
    );
    expect(result.signals.locationMatch).toBe(false);
  });

  it("returns 0 when job location is null", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: ["Lagos"], workModes: [] },
      { requirements: null, location: null, employmentType: "full_time" },
    );
    expect(result.signals.locationMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Employment type match
// ---------------------------------------------------------------------------

describe("computeMatchScore — employment type match", () => {
  it("returns 15 points when workModes includes 'remote'", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: ["remote"] },
      { requirements: null, location: null, employmentType: "full_time" },
    );
    expect(result.signals.employmentTypeMatch).toBe(true);
    expect(result.score).toBe(15);
  });

  it("returns 10 points when workModes is empty (no preference)", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: [] },
      { requirements: null, location: null, employmentType: "contract" },
    );
    expect(result.signals.employmentTypeMatch).toBe(true);
    expect(result.score).toBe(10);
  });

  it("returns 15 points when workModes includes 'onsite'", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: ["onsite"] },
      { requirements: null, location: null, employmentType: "part_time" },
    );
    expect(result.signals.employmentTypeMatch).toBe(true);
    expect(result.score).toBe(15);
  });

  it("returns 15 points when workModes includes 'hybrid'", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: ["hybrid"] },
      { requirements: null, location: null, employmentType: "internship" },
    );
    expect(result.signals.employmentTypeMatch).toBe(true);
    expect(result.score).toBe(15);
  });

  it("returns 0 for unknown workMode (mismatch)", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: ["moon_base"] },
      { requirements: null, location: null, employmentType: "full_time" },
    );
    expect(result.signals.employmentTypeMatch).toBe(false);
    expect(result.score).toBe(0);
  });

  it("returns 10 when preferences is null", () => {
    const result = computeMatchScore({ skills: [] }, null, {
      requirements: null,
      location: null,
      employmentType: "full_time",
    });
    expect(result.signals.employmentTypeMatch).toBe(true);
    expect(result.score).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Integration: combined signals
// ---------------------------------------------------------------------------

describe("computeMatchScore — combined signals and tier assignment", () => {
  it("combines all signals correctly", () => {
    // skills: 2/2 match = 60, location: exact match = 25, employment = 15 → 100
    const result = computeMatchScore(
      { skills: ["JavaScript", "React"] },
      { locations: ["Lagos"], workModes: ["remote"] },
      {
        requirements: "JavaScript React developer",
        location: "Lagos, Nigeria",
        employmentType: "full_time",
      },
    );
    expect(result.score).toBe(100);
    expect(result.tier).toBe("strong");
  });

  it("caps combined score at 100", () => {
    const result = computeMatchScore(
      { skills: ["a", "b", "c", "d", "e"] },
      { locations: ["Lagos"], workModes: ["remote"] },
      {
        requirements: "a b c d e f",
        location: "Lagos, Nigeria",
        employmentType: "full_time",
      },
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("assigns 'strong' tier for score >= 75", () => {
    const result = computeMatchScore(baseProfile, basePrefs, baseJob);
    expect(["strong", "good", "fair", "none"]).toContain(result.tier);
    if (result.score >= 75) expect(result.tier).toBe("strong");
    if (result.score >= 50 && result.score < 75) expect(result.tier).toBe("good");
    if (result.score >= 30 && result.score < 50) expect(result.tier).toBe("fair");
    if (result.score < 30) expect(result.tier).toBe("none");
  });

  it("assigns 'none' tier for score < 30", () => {
    const result = computeMatchScore(
      { skills: [] },
      { locations: [], workModes: [] },
      { requirements: null, location: null, employmentType: "full_time" },
    );
    // 0 + 0 + 10 = 10 → none
    expect(result.score).toBe(10);
    expect(result.tier).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("computeMatchScore — edge cases", () => {
  it("handles empty skills array gracefully", () => {
    const result = computeMatchScore({ skills: [] }, basePrefs, baseJob);
    expect(result.signals.skillsOverlap).toBe(0);
  });

  it("handles null requirements gracefully", () => {
    const result = computeMatchScore(baseProfile, basePrefs, {
      ...baseJob,
      requirements: null,
    });
    expect(result.signals.skillsOverlap).toBe(0);
  });

  it("handles empty locations array gracefully", () => {
    const result = computeMatchScore(
      baseProfile,
      { locations: [], workModes: ["remote"] },
      baseJob,
    );
    expect(result.signals.locationMatch).toBe(false);
  });

  it("handles null preferences gracefully", () => {
    const result = computeMatchScore(baseProfile, null, baseJob);
    expect(result.signals.locationMatch).toBe(false);
    expect(result.signals.employmentTypeMatch).toBe(true); // 10 for no preference
  });
});
