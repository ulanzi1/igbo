// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { blocklistRule } from "./blocklist.rule";
import type { ScreeningInput } from "../types";

const baseInput: ScreeningInput = {
  title: "Senior Developer",
  descriptionHtml: "<p>We are looking for a passionate developer.</p>",
  descriptionIgboHtml: null,
  employmentType: "full_time",
  salaryMin: 200_000,
  salaryMax: 500_000,
  salaryCompetitiveOnly: false,
};

describe("blocklistRule", () => {
  it("returns no flags when blocklist is empty", () => {
    expect(blocklistRule(baseInput, { blocklistPhrases: [] })).toEqual([]);
  });

  it("returns no flags when no phrase matches", () => {
    expect(blocklistRule(baseInput, { blocklistPhrases: ["must be male"] })).toEqual([]);
  });

  it("flags a match in description", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionHtml: "<p>Applicant must be male and under 30.</p>",
    };
    const flags = blocklistRule(input, { blocklistPhrases: ["must be male"] });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule_id).toBe("blocklist_hit");
    expect(flags[0]!.severity).toBe("high");
    expect(flags[0]!.match).toBe("must be male");
    expect(flags[0]!.field).toBe("description");
  });

  it("flags a match in title", () => {
    const input: ScreeningInput = {
      ...baseInput,
      title: "Looking for male applicant only",
    };
    const flags = blocklistRule(input, { blocklistPhrases: ["male applicant"] });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("title");
  });

  it("does NOT match substring inside another word (whole-word matching)", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionHtml: "<p>Female applicants are encouraged to apply.</p>",
    };
    // 'male' should NOT match inside 'Female'
    const flags = blocklistRule(input, { blocklistPhrases: ["male"] });
    expect(flags).toEqual([]);
  });

  it("is case-insensitive", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionHtml: "<p>MUST BE MALE applicant.</p>",
    };
    const flags = blocklistRule(input, { blocklistPhrases: ["must be male"] });
    expect(flags).toHaveLength(1);
  });

  it("matches in Igbo description when present", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionIgboHtml: "<p>Onye nwoke bụ ọ must be male ka ọ bụrụ.</p>",
    };
    const flags = blocklistRule(input, { blocklistPhrases: ["must be male"] });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("descriptionIgbo");
  });

  it("handles accent-normalized matching", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionHtml: "<p>Naïve test phrase.</p>",
    };
    // phrase stored as "naive" (normalized), should match "naïve" in input
    const flags = blocklistRule(input, { blocklistPhrases: ["naive"] });
    expect(flags).toHaveLength(1);
  });

  it("flags multiple distinct phrases", () => {
    const input: ScreeningInput = {
      ...baseInput,
      descriptionHtml: "<p>Work from home crypto investment opportunity.</p>",
    };
    const flags = blocklistRule(input, {
      blocklistPhrases: ["crypto investment", "work from home"],
    });
    expect(flags).toHaveLength(2);
  });

  it("emits only one flag per phrase even if it matches in multiple fields", () => {
    const input: ScreeningInput = {
      ...baseInput,
      title: "must be male position",
      descriptionHtml: "<p>Applicant must be male.</p>",
    };
    const flags = blocklistRule(input, { blocklistPhrases: ["must be male"] });
    // title matches first → one flag per phrase
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("title");
  });
});
