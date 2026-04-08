// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { descriptionQualityRule } from "./description-quality.rule";
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

function makeDesc(length: number, char = "a"): string {
  return `<p>${char.repeat(length)}</p>`;
}

describe("descriptionQualityRule", () => {
  it("returns no flags for a valid description (100-50000 chars)", () => {
    const desc = `<p>${"This is a valid job description for testing. ".repeat(5)}</p>`;
    expect(descriptionQualityRule({ ...baseInput, descriptionHtml: desc })).toEqual([]);
  });

  it("flags description shorter than 100 chars (medium)", () => {
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: "<p>Short desc.</p>" });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule_id).toBe("description_too_short");
    expect(flags[0]!.severity).toBe("medium");
  });

  it("flags description of exactly 50 chars as too short", () => {
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: makeDesc(50) });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule_id).toBe("description_too_short");
  });

  it("does not flag description of exactly 100 chars", () => {
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: makeDesc(100) });
    const shortFlags = flags.filter((f) => f.rule_id === "description_too_short");
    expect(shortFlags).toHaveLength(0);
  });

  it("flags description longer than 50,000 chars (high)", () => {
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: makeDesc(50_001) });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule_id).toBe("description_too_long");
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags description with all-caps ratio > 70% over 50+ chars (medium)", () => {
    // 80% uppercase: 80 uppercase + 20 lowercase letters (over 50 chars)
    const caps = "A".repeat(80) + "a".repeat(20);
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: `<p>${caps}</p>` });
    const capsFlag = flags.find((f) => f.rule_id === "description_all_caps");
    expect(capsFlag).toBeDefined();
    expect(capsFlag?.severity).toBe("medium");
  });

  it("does not flag all-caps when text is below 50 chars", () => {
    const caps = "A".repeat(40);
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: `<p>${caps}</p>` });
    // too short + not all-caps-checked (below 50)
    const capsFlag = flags.find((f) => f.rule_id === "description_all_caps");
    expect(capsFlag).toBeUndefined();
  });

  it("returns empty array for null description (required_fields handles it)", () => {
    const flags = descriptionQualityRule({ ...baseInput, descriptionHtml: null });
    expect(flags).toEqual([]);
  });
});
