// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getMatchHints, SKILLS_MAX_SCORE, SKILLS_CHECKMARK_THRESHOLD } from "./get-match-hints";

function signals(skillsOverlap: number, locationMatch: boolean, employmentTypeMatch: boolean) {
  return { skillsOverlap, locationMatch, employmentTypeMatch };
}

describe("getMatchHints", () => {
  it("returns skills + location when all signals weak", () => {
    const hints = getMatchHints(signals(0, false, false));
    expect(hints).toEqual([
      { signal: "skills", messageKey: "hintSkills" },
      { signal: "location", messageKey: "hintLocation" },
    ]);
  });

  it("returns skills only when booleans are both strong", () => {
    const hints = getMatchHints(signals(0, true, true));
    expect(hints).toEqual([{ signal: "skills", messageKey: "hintSkills" }]);
  });

  it("returns location + employmentType when skills strong, both booleans false", () => {
    const hints = getMatchHints(signals(60, false, false));
    expect(hints).toEqual([
      { signal: "location", messageKey: "hintLocation" },
      { signal: "employmentType", messageKey: "hintEmploymentType" },
    ]);
  });

  it("returns employmentType only when skills strong and location matches", () => {
    const hints = getMatchHints(signals(60, true, false));
    expect(hints).toEqual([{ signal: "employmentType", messageKey: "hintEmploymentType" }]);
  });

  it("returns empty when all signals strong", () => {
    const hints = getMatchHints(signals(60, true, true));
    expect(hints).toEqual([]);
  });

  it("excludes skills at threshold (30/60 = 0.5, strict < 0.5)", () => {
    const hints = getMatchHints(signals(30, false, true));
    expect(hints).toEqual([{ signal: "location", messageKey: "hintLocation" }]);
  });

  it("includes skills below threshold (10/60 < 0.5) + location", () => {
    const hints = getMatchHints(signals(10, false, true));
    expect(hints).toEqual([
      { signal: "skills", messageKey: "hintSkills" },
      { signal: "location", messageKey: "hintLocation" },
    ]);
  });

  it("returns skills + employmentType when location matches but type does not", () => {
    const hints = getMatchHints(signals(0, true, false));
    expect(hints).toEqual([
      { signal: "skills", messageKey: "hintSkills" },
      { signal: "employmentType", messageKey: "hintEmploymentType" },
    ]);
  });

  it("excludes skills at threshold with both booleans false", () => {
    const hints = getMatchHints(signals(30, false, false));
    expect(hints).toEqual([
      { signal: "location", messageKey: "hintLocation" },
      { signal: "employmentType", messageKey: "hintEmploymentType" },
    ]);
  });
});

describe("getMatchHints — boundary", () => {
  it("includes skills hint at 29 (29/60 = 0.483 < 0.5)", () => {
    const hints = getMatchHints(signals(29, true, true));
    expect(hints).toEqual([{ signal: "skills", messageKey: "hintSkills" }]);
  });

  it("excludes skills hint at 30 (30/60 = 0.5, strict < 0.5)", () => {
    const hints = getMatchHints(signals(30, true, true));
    expect(hints).toEqual([]);
  });
});

describe("getMatchHints — constants", () => {
  it("SKILLS_MAX_SCORE is 60", () => {
    expect(SKILLS_MAX_SCORE).toBe(60);
  });

  it("SKILLS_CHECKMARK_THRESHOLD is 30", () => {
    expect(SKILLS_CHECKMARK_THRESHOLD).toBe(30);
  });
});
