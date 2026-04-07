// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requiredFieldsRule } from "./required-fields.rule";
import type { ScreeningInput } from "../types";

const validInput: ScreeningInput = {
  title: "Senior Software Engineer",
  descriptionHtml: "<p>We are looking for a senior engineer.</p>",
  descriptionIgboHtml: null,
  employmentType: "full_time",
  salaryMin: 200_000,
  salaryMax: 500_000,
  salaryCompetitiveOnly: false,
};

describe("requiredFieldsRule", () => {
  it("returns no flags for a valid posting", () => {
    expect(requiredFieldsRule(validInput)).toEqual([]);
  });

  it("flags missing title", () => {
    const flags = requiredFieldsRule({ ...validInput, title: null });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule_id).toBe("required_field_missing");
    expect(flags[0]!.field).toBe("title");
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags empty title string", () => {
    const flags = requiredFieldsRule({ ...validInput, title: "   " });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("title");
  });

  it("flags missing description", () => {
    const flags = requiredFieldsRule({ ...validInput, descriptionHtml: null });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("description");
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags HTML-only description (no plain text)", () => {
    const flags = requiredFieldsRule({ ...validInput, descriptionHtml: "<p></p>" });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("description");
  });

  it("flags missing employmentType", () => {
    const flags = requiredFieldsRule({ ...validInput, employmentType: null });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.field).toBe("employmentType");
    expect(flags[0]!.severity).toBe("high");
  });

  it("flags all three missing fields simultaneously", () => {
    const flags = requiredFieldsRule({
      ...validInput,
      title: null,
      descriptionHtml: null,
      employmentType: null,
    });
    expect(flags).toHaveLength(3);
    const fields = flags.map((f) => f.field);
    expect(fields).toContain("title");
    expect(fields).toContain("description");
    expect(fields).toContain("employmentType");
  });
});
