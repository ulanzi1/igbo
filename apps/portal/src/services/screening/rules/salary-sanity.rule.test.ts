// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { salarySanityRule } from "./salary-sanity.rule";
import type { ScreeningInput } from "../types";

const baseInput: ScreeningInput = {
  title: "Engineer",
  descriptionHtml: "<p>Description</p>",
  descriptionIgboHtml: null,
  employmentType: "full_time",
  salaryMin: 200_000,
  salaryMax: 500_000,
  salaryCompetitiveOnly: false,
};

describe("salarySanityRule", () => {
  it("returns no flags for a valid salary range", () => {
    expect(salarySanityRule(baseInput)).toEqual([]);
  });

  it("skips when salaryCompetitiveOnly is true", () => {
    expect(salarySanityRule({ ...baseInput, salaryCompetitiveOnly: true })).toEqual([]);
  });

  it("skips when salaryMin is null", () => {
    expect(salarySanityRule({ ...baseInput, salaryMin: null })).toEqual([]);
  });

  it("skips when salaryMax is null", () => {
    expect(salarySanityRule({ ...baseInput, salaryMax: null })).toEqual([]);
  });

  it("flags when salaryMin <= 0 (high)", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: 0 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("high");
    expect(flags[0]!.rule_id).toBe("salary_invalid");
  });

  it("flags when salaryMin is negative (high)", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: -1000 });
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags when salaryMax <= salaryMin (high)", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: 500_000, salaryMax: 200_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("high");
    expect(flags[0]!.rule_id).toBe("salary_invalid");
  });

  it("flags when salaryMax > 10 × salaryMin (high)", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: 100_000, salaryMax: 1_100_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags when salaryMin < SALARY_MIN_BOUND (50,000) but > 0 (high)", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: 30_000, salaryMax: 60_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("high");
    expect(flags[0]!.rule_id).toBe("salary_invalid");
  });

  it("flags when salaryMax > SALARY_MAX_BOUND (50,000,000) (high)", () => {
    const flags = salarySanityRule({
      ...baseInput,
      salaryMin: 200_000,
      salaryMax: 200_000_000,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags salaryMin < SALARY_OUTLIER_LOW (100,000) but >= MIN_BOUND (medium warning)", () => {
    // min = 75,000 (>= 50,000 but < 100,000) and max within 10x
    const flags = salarySanityRule({ ...baseInput, salaryMin: 75_000, salaryMax: 200_000 });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("medium");
    expect(flags[0]!.rule_id).toBe("salary_outlier");
  });

  it("flags salaryMax > SALARY_OUTLIER_HIGH (20,000,000) but <= MAX_BOUND (medium warning)", () => {
    // Use salaryMin=3M so the 10× spread check (25M < 10×3M=30M) doesn't fire first
    const flags = salarySanityRule({
      ...baseInput,
      salaryMin: 3_000_000,
      salaryMax: 25_000_000,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("medium");
    expect(flags[0]!.rule_id).toBe("salary_outlier");
  });

  it("exact SALARY_MIN_BOUND value (50,000) passes", () => {
    const flags = salarySanityRule({ ...baseInput, salaryMin: 50_000, salaryMax: 200_000 });
    // 50_000 is not < SALARY_MIN_BOUND (it's equal), so no high flag
    // 50_000 is < SALARY_OUTLIER_LOW (100,000), so medium warning
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("medium");
  });

  it("exact SALARY_MAX_BOUND value (50,000,000) passes without high flag", () => {
    // Use salaryMin=6M so the 10× spread check (50M < 10×6M=60M) doesn't fire first
    const flags = salarySanityRule({
      ...baseInput,
      salaryMin: 6_000_000,
      salaryMax: 50_000_000,
    });
    // max is exactly at bound, not > bound, so no high flag
    // max > SALARY_OUTLIER_HIGH (20,000,000), so medium warning
    expect(flags.length).toBeLessThanOrEqual(1);
    if (flags.length > 0) {
      expect(flags[0]!.severity).toBe("medium");
    }
  });
});
